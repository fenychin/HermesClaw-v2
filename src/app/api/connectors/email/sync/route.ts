/**
 * POST /api/connectors/email/sync — 触发邮件拉取与询盘入库
 *
 * —— 对应 AGENTS.md §4.3：连接器调用须全程留痕（AgentLog + AuditLog）。
 *    流程：IMAP 连接 → 拉取未读 → 解析询盘 → 写入 Inquiry 表 → 标记已读。
 *
 * —— AGENTS.md §5 #3 禁止静默执行：同步前写入预记录审计，同步后更新状态。
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { createAuditEntry, updateAuditEntry, writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { createEmailConnector } from "@/lib/server/connectors/email/email-connector"
import { parseInquiriesFromEmails } from "@/lib/server/connectors/email/inquiry-parser"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"
import { writeAgentLog } from "@/lib/server/agent-log"

export const runtime = "nodejs"

/** POST /api/connectors/email/sync */
export async function POST(request: Request) {
  const ctx = await buildWorkspaceContext(request)
  requireWritable(ctx.role)
  const actor = await actorFromSession()

  // AGENTS.md §5 #3 禁止静默执行：同步前写入预记录审计
  const preEntry = await createAuditEntry({
    actor,
    action: "connector.email.sync",
    targetType: "inquiry",
    targetId: `batch-${Date.now()}`,
    detail: "开始邮件同步",
    riskLevel: "low",
    workspaceId: ctx.workspaceId,
    automationLevel: "L2",
    triggeredBy: "system",
    contextSnapshot: {
      connectorType: "email",
      action: "sync",
    },
  })

  const connector = createEmailConnector()
  const startTime = Date.now()

  try {
    // ① 拉取未读邮件
    const emails = await connector.fetchUnseen(50)
    const duration = `${((Date.now() - startTime) / 1000).toFixed(1)}s`

    // 记录连接器运行日志（用于评估连接器成功率）
    void writeAgentLog({
      source: "connector",
      taskName: "Email IMAP 收信",
      status: "success",
      duration,
      detail: `拉取 ${emails.length} 封未读邮件`,
    })

    logger.info("Email sync: 拉取完成", { count: emails.length, actor })

    if (emails.length === 0) {
      await updateAuditEntry({
        auditId: preEntry.auditId,
        status: "success",
        detail: "无新邮件",
      })
      return successResponse({
        synced: 0,
        message: "无新邮件",
      })
    }

    // ② 解析询盘字段
    const inquiries = parseInquiriesFromEmails(emails)

    // ③ 批量写入 Inquiry 表（逐条写入以确保审计精准）
    let synced = 0
    const uids: number[] = []

    for (let i = 0; i < inquiries.length; i++) {
      const inquiry = inquiries[i]
      const email = emails[i]

      try {
        await prisma.inquiry.create({
          data: {
            id: crypto.randomUUID(),
            workspaceId: ctx.workspaceId,
            fromCountry: inquiry.fromCountry,
            countryFlag: inquiry.countryFlag,
            companyName: inquiry.companyName,
            summary: inquiry.summary,
            priority: inquiry.priority,
            channel: inquiry.channel,
            receivedAt: inquiry.receivedAt,
            replied: false,
          },
        })

        uids.push(email.uid)
        synced++
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "未知错误"
        logger.error("Email sync: Inquiry 写入失败", {
          subject: email.subject,
          error: errorMsg,
        })

        // 记录局部失败至 AgentLog 以补强可观测性
        void writeAgentLog({
          source: "connector",
          taskName: "Email 询盘入库",
          status: "failed",
          duration: "0s",
          detail: `询盘入库失败 (邮件主题: ${email.subject.slice(0, 50)}): ${errorMsg}`,
        })
        // 单条失败不阻断整体流程
      }
    }

    // ④ 标记已读（仅成功入库的）
    if (uids.length > 0) {
      await connector.markSeen(uids)
    }

    // ⑤ 同步成功 → 更新预记录为 success（AGENTS.md §4.3）
    await updateAuditEntry({
      auditId: preEntry.auditId,
      status: "success",
      detail: `拉取 ${emails.length} 封，入库 ${synced} 条询盘`,
      contextSnapshot: {
        fetched: emails.length,
        synced,
        skipped: emails.length - synced,
        uids,
      },
    })

    logger.info("Email sync: 完成", { fetched: emails.length, synced })

    return successResponse({
      synced,
      fetched: emails.length,
      skipped: emails.length - synced,
      message: `成功入库 ${synced} 条询盘`,
    })
  } catch (error) {
    const duration = `${((Date.now() - startTime) / 1000).toFixed(1)}s`
    const message =
      error instanceof Error ? error.message : "同步失败"
    logger.error("Email sync: 失败", { error: message })

    // 记录连接器运行日志（用于评估连接器成功率）
    void writeAgentLog({
      source: "connector",
      taskName: "Email IMAP 收信",
      status: "failed",
      duration,
      detail: `IMAP 拉取失败: ${message}`,
    })

    // 同步失败 → 更新预记录为 failed + 补充失败日志
    await updateAuditEntry({
      auditId: preEntry.auditId,
      status: "failed",
      detail: `同步失败: ${message}`,
    })
    await writeAuditLog({
      actor,
      action: "connector.email.sync.failed",
      targetType: "inquiry",
      targetId: `error-${Date.now()}`,
      detail: `同步失败: ${message}`,
      riskLevel: "medium",
      workspaceId: ctx.workspaceId,
    })

    return errorResponse(`邮件同步失败: ${message}`)
  } finally {
    await connector.dispose()
  }
}


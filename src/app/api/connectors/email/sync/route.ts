/**
 * POST /api/connectors/email/sync — 触发邮件拉取与询盘入库
 *
 * —— 对应 AGENTS.md §4.3：连接器调用须全程留痕（AgentLog + AuditLog）。
 *    流程：IMAP 连接 → 拉取未读 → 解析询盘 → 写入 Inquiry 表 → 标记已读。
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { createEmailConnector } from "@/lib/server/connectors/email/email-connector"
import { parseInquiriesFromEmails } from "@/lib/server/connectors/email/inquiry-parser"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"

export const runtime = "nodejs"

/** POST /api/connectors/email/sync */
export async function POST(request: Request) {
  const ctx = await buildWorkspaceContext(request)
  requireWritable(ctx.role)
  const actor = await actorFromSession()
  const connector = createEmailConnector()

  try {
    // ① 拉取未读邮件
    const emails = await connector.fetchUnseen(50)
    logger.info("Email sync: 拉取完成", { count: emails.length, actor })

    if (emails.length === 0) {
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
        logger.error("Email sync: Inquiry 写入失败", {
          subject: email.subject,
          error: err instanceof Error ? err.message : "未知错误",
        })
        // 单条失败不阻断整体流程
      }
    }

    // ④ 标记已读（仅成功入库的）
    if (uids.length > 0) {
      await connector.markSeen(uids)
    }

    // ⑤ 审计日志（AGENTS.md §4.3：关键操作须可溯源）
    await writeAuditLog({
      actor,
      action: "connector.email.sync",
      targetType: "inquiry",
      targetId: `batch-${Date.now()}`,
      detail: `拉取 ${emails.length} 封，入库 ${synced} 条询盘`,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
    })

    logger.info("Email sync: 完成", { fetched: emails.length, synced })

    return successResponse({
      synced,
      fetched: emails.length,
      skipped: emails.length - synced,
      message: `成功入库 ${synced} 条询盘`,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "同步失败"
    logger.error("Email sync: 失败", { error: message })

    // 失败也要留审计
    await writeAuditLog({
      actor,
      action: "connector.email.sync",
      targetType: "inquiry",
      targetId: `error-${Date.now()}`,
      detail: `同步失败: ${message}`,
      riskLevel: "mid",
      workspaceId: ctx.workspaceId,
    })

    return errorResponse(`邮件同步失败: ${message}`)
  } finally {
    await connector.dispose()
  }
}

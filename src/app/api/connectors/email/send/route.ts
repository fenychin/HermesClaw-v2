/**
 * POST /api/connectors/email/send — 发送邮件（L2 操作：自动执行但留痕）
 *
 * —— 对应 AGENTS.md §4.7 L2 授权等级：系统可自动执行，但必须写入 AuditLog。
 *    凭证从环境变量注入，生产环境 Token 有效期 ≤ 1 小时。
 *    请求体校验使用 Zod。
 *
 * —— AGENTS.md §5 #3 禁止静默执行：发送前写入预记录审计，发送后更新状态。
 */
import { z } from "zod"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { createAuditEntry, updateAuditEntry, writeAuditLog, actorFromSession } from "@/lib/server/shared/audit"
import { createEmailConnector } from "@/lib/server/connectors/email/email-connector"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"
import { writeAgentLog } from "@/lib/server/shared/agent-log"
import {
  readIdempotencyKey,
  checkIdempotencyKey,
  storeIdempotencyKey,
} from "@/lib/idempotency"

export const runtime = "nodejs"

/** 发送邮件请求体 Schema */
const SendEmailRequestSchema = z.object({
  to: z.string().email("收件人邮箱格式无效"),
  subject: z.string().min(1, "主题不能为空").max(500),
  text: z.string().min(1, "正文不能为空").max(50000),
  html: z.string().max(100000).optional(),
  fromName: z.string().max(100).optional(),
  replyTo: z.string().email().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1),
        content: z.string().min(1),
        contentType: z.string().optional(),
      }),
    )
    .max(10)
    .optional(),
})

/** POST /api/connectors/email/send */
export async function POST(request: Request) {
  const ctx = await buildWorkspaceContext(request)
  requireWritable(ctx.role)
  const actor = await actorFromSession()

  // AGENTS.md §3.4：高危对外动作必须具备幂等保护，防止客户端重试触发重复发信
  const idempotencyKey = readIdempotencyKey(request)
  if (idempotencyKey) {
    const hit = await checkIdempotencyKey(ctx.workspaceId, idempotencyKey)
    if (hit) {
      return successResponse({
        idempotent: true,
        messageId: hit.taskId, // 复用 taskId 列存 messageId
        message: "邮件已通过幂等键命中，未重复发送",
      })
    }
  }

  // 解析并校验请求体
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return errorResponse("请求体须为有效 JSON", 400)
  }

  const parsed = SendEmailRequestSchema.safeParse(rawBody)
  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        error: "参数验证失败",
        details: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    )
  }

  const { to, subject, text, html, fromName, replyTo, attachments } =
    parsed.data

  // AGENTS.md §5 #3 禁止静默执行：发送前写入预记录审计
  const preEntry = await createAuditEntry({
    actor,
    action: "connector.email.send",
    targetType: "email",
    targetId: to,
    detail: `发送邮件至 ${to}，主题: ${subject.slice(0, 100)}`,
    riskLevel: "medium",
    workspaceId: ctx.workspaceId,
    automationLevel: "L2",
    triggeredBy: "user",
    contextSnapshot: {
      to,
      subject: subject.slice(0, 100),
      hasHtml: !!html,
      hasAttachments: !!(attachments && attachments.length > 0),
      replyTo: replyTo ?? null,
    },
  })

  const connector = createEmailConnector()
  const startTime = Date.now()

  try {
    const result = await connector.send({
      to,
      subject,
      text,
      html,
      fromName,
      replyTo,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "utf-8"),
        contentType: a.contentType,
      })),
    })

    const duration = `${((Date.now() - startTime) / 1000).toFixed(1)}s`

    if (!result.ok) {
      logger.error("Email send: 发送失败", {
        to,
        subject,
        error: result.error,
      })

      // 写入连接器运行日志（用作成功率评估输入）
      void writeAgentLog({
        source: "connector",
        taskName: "Email SMTP 发信",
        status: "failed",
        duration,
        detail: `发送失败至 ${to}: ${result.error}`,
        riskLevel: "medium",
      })

      // 发送失败 → 更新预记录为 failed + 补充失败日志
      await updateAuditEntry({
        auditId: preEntry.auditId,
        status: "failed",
        detail: `发送失败: ${result.error}`,
      })
      await writeAuditLog({
        actor,
        action: "connector.email.send.failed",
        targetType: "email",
        targetId: to,
        detail: `发送失败: ${result.error}`,
        riskLevel: "medium",
        workspaceId: ctx.workspaceId,
      })

      return errorResponse(`邮件发送失败: ${result.error}`, 502)
    }

    // 写入连接器运行日志（用作成功率评估输入）
    void writeAgentLog({
      source: "connector",
      taskName: "Email SMTP 发信",
      status: "success",
      duration,
      detail: `已发送至 ${to}：主题: ${subject}`,
      riskLevel: "medium",
    })

    // 发送成功 → 更新预记录为 success
    await updateAuditEntry({
      auditId: preEntry.auditId,
      status: "success",
      detail: `发送成功至 ${to}，messageId: ${result.messageId}`,
      contextSnapshot: {
        messageId: result.messageId,
        sentAt: new Date().toISOString(),
      },
    })

    // 持久化幂等键 → messageId 映射（24h 内重复请求直接命中，不再发送）
    if (idempotencyKey && result.messageId) {
      await storeIdempotencyKey({
        workspaceId: ctx.workspaceId,
        key: idempotencyKey,
        taskId: result.messageId,
        scope: "/api/connectors/email/send",
      })
    }

    logger.info("Email send: 发送成功", {
      to,
      subject,
      messageId: result.messageId,
    })

    return successResponse({
      messageId: result.messageId,
      to,
      subject,
      message: "邮件已发送",
    })
  } catch (error) {
    const duration = `${((Date.now() - startTime) / 1000).toFixed(1)}s`
    const message =
      error instanceof Error ? error.message : "发送异常"

    logger.error("Email send: 异常", { error: message })

    // 写入连接器运行日志（用作成功率评估输入）
    void writeAgentLog({
      source: "connector",
      taskName: "Email SMTP 发信",
      status: "failed",
      duration,
      detail: `发送异常: ${message}`,
      riskLevel: "medium",
    })

    // 发送异常 → 更新预记录为 failed
    await updateAuditEntry({
      auditId: preEntry.auditId,
      status: "failed",
      detail: `发送异常: ${message}`,
    })
    await writeAuditLog({
      actor,
      action: "connector.email.send.error",
      targetType: "email",
      targetId: to,
      detail: `发送异常: ${message}`,
      riskLevel: "high",
      workspaceId: ctx.workspaceId,
    })

    return errorResponse(`邮件发送异常: ${message}`)
  } finally {
    await connector.dispose()
  }
}


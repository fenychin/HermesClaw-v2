/**
 * POST /api/connectors/email/send — 发送邮件（L2 操作：自动执行但留痕）
 *
 * —— 对应 AGENTS.md §4.7 L2 授权等级：系统可自动执行，但必须写入 AuditLog。
 *    凭证从环境变量注入，生产环境 Token 有效期 ≤ 1 小时。
 *    请求体校验使用 Zod。
 */
import { z } from "zod"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { createEmailConnector } from "@/lib/server/connectors/email/email-connector"
import { buildWorkspaceContext } from "@/lib/workspace"

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
  const actor = await actorFromSession()

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

  // L2 操作审计：执行前留痕（AGENTS.md §4.7）
  await writeAuditLog({
    actor,
    action: "connector.email.send",
    targetType: "email",
    targetId: to,
    detail: `发送邮件至 ${to}，主题: ${subject.slice(0, 100)}`,
    riskLevel: "mid",
    workspaceId: ctx.workspaceId,
  })

  const connector = createEmailConnector()

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

    if (!result.ok) {
      logger.error("Email send: 发送失败", {
        to,
        subject,
        error: result.error,
      })

      // 失败审计
      await writeAuditLog({
        actor,
        action: "connector.email.send.failed",
        targetType: "email",
        targetId: to,
        detail: `发送失败: ${result.error}`,
        riskLevel: "mid",
        workspaceId: ctx.workspaceId,
      })

      return errorResponse(`邮件发送失败: ${result.error}`, 502)
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
    const message =
      error instanceof Error ? error.message : "发送异常"

    logger.error("Email send: 异常", { error: message })

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

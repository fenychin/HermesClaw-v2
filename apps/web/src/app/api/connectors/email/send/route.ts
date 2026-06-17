import { ApiResponse } from '@/lib/server/api-response'; import { withRBAC } from '@/lib/server/api-handler'
import { checkAutomationGate } from '@/lib/server/guardrail'; import { sendEmail, LeaseTokenValidationError } from '@/lib/server/connectors/email-connector'
import type { WorkspaceContext } from '@/lib/workspace'; import { z } from 'zod'

const SendEmailInputSchema = z.object({ connectorId: z.string(), from: z.object({ address: z.string().email(), name: z.string().optional() }), to: z.array(z.object({ address: z.string().email(), name: z.string().optional() })).min(1), cc: z.array(z.object({ address: z.string().email(), name: z.string().optional() })).optional(), subject: z.string(), bodyHtml: z.string(), bodyText: z.string().optional(), attachments: z.array(z.object({ filename: z.string(), content: z.string(), contentType: z.string(), size: z.number() })).optional(), templateId: z.string().optional(), templateVariables: z.record(z.string(), z.string()).optional(), agentId: z.string().optional(), taskId: z.string().optional(), leaseToken: z.string().optional(), injectUnsubscribeLink: z.boolean().optional(), unsubscribeUrl: z.string().optional(), confirm: z.boolean().optional() })

export const POST = withRBAC(async (req: Request, ctx: WorkspaceContext) => {
  const body = await req.json(); const parsed = SendEmailInputSchema.safeParse(body)
  if (!parsed.success) return ApiResponse.error('请求参数校验失败: ' + parsed.error.message, 400)
  const d = parsed.data
  const gate = await checkAutomationGate({ automationLevel: "L2", riskLevel: "medium", confirmed: d.confirm === true, actionName: `发送邮件: ${d.subject}` })
  if (!gate.ok) return gate.response
  try {
    const result = await sendEmail({ connectorId: d.connectorId, workspaceId: ctx.workspaceId, from: d.from, to: d.to, cc: d.cc, subject: d.subject, bodyHtml: d.bodyHtml, bodyText: d.bodyText, attachments: d.attachments, templateId: d.templateId, templateVariables: d.templateVariables, agentId: d.agentId, taskId: d.taskId, leaseToken: d.leaseToken, injectUnsubscribeLink: d.injectUnsubscribeLink, unsubscribeUrl: d.unsubscribeUrl })
    return ApiResponse.ok(result)
  } catch (error) { if (error instanceof LeaseTokenValidationError) return ApiResponse.error(error.message, 403); return ApiResponse.error(error instanceof Error ? error.message : '发送失败', 500) }
}, 'MEMBER')

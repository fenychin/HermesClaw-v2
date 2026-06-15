import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { checkAutomationGate } from '@/lib/server/guardrail'
import { sendEmail, LeaseTokenValidationError } from '@/lib/server/connectors/email-connector'
import type { WorkspaceContext } from '@/lib/workspace'
import { z } from 'zod'

const EmailAddressSchema = z.object({
  address: z.string().email(),
  name: z.string().optional()
})

const EmailAttachmentSchema = z.object({
  filename: z.string(),
  content: z.string(), // base64
  contentType: z.string(),
  size: z.number()
})

const SendEmailInputSchema = z.object({
  connectorId: z.string(),
  from: EmailAddressSchema,
  to: z.array(EmailAddressSchema).min(1, '至少需要一个收件人'),
  cc: z.array(EmailAddressSchema).optional(),
  subject: z.string(),
  bodyHtml: z.string(),
  bodyText: z.string().optional(),
  attachments: z.array(EmailAttachmentSchema).optional(),
  templateId: z.string().optional(),
  templateVariables: z.record(z.string(), z.string()).optional(),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  leaseToken: z.string().optional(),
  injectUnsubscribeLink: z.boolean().optional(),
  unsubscribeUrl: z.string().optional(),
  confirm: z.boolean().optional() // 用于批量发送二次确认
})

// POST /api/connectors/email/send
// 发送邮件接口
export const POST = withRBAC(
  async (request: Request, ctx: WorkspaceContext) => {
    try {
      const body = await request.json()
      const parsed = SendEmailInputSchema.safeParse(body)
      if (!parsed.success) {
        return ApiResponse.error('请求参数校验失败: ' + parsed.error.message, 400)
      }

      const input = parsed.data

      // 批量发送（to > 10）必须通过 guardrail confirm 保护
      if (input.to.length > 10) {
        const gate = await checkAutomationGate({
          automationLevel: 'L3',
          riskLevel: 'high',
          confirmed: input.confirm === true,
          actionName: '批量发送邮件'
        })
        if (!gate.ok) {
          return gate.response
        }
      }

      const result = await sendEmail({
        ...input,
        workspaceId: ctx.workspaceId
      })

      if (result.status === 'failed') {
        return ApiResponse.error(result.errorMessage || '发送失败', 500)
      }

      return ApiResponse.ok(result)
    } catch (error) {
      if (error instanceof LeaseTokenValidationError) {
        const isMissing = error.message.includes('requires')
        return ApiResponse.error(error.message, isMissing ? 400 : 403)
      }
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'MEMBER'
)

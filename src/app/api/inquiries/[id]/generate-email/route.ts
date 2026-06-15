import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger'
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { type WorkspaceContext } from "@/lib/workspace"
import { actorFromSession } from "@/lib/server/audit"
import { auditedWrite } from "@/lib/server/audited-write"
import { ApiResponse } from "@/lib/server/api-response"
import { selectModel } from "@/lib/server/model-router"
import { callAnthropicStructured, callDeepSeekJson } from "@/lib/server/llm-provider"

export const POST = withRBAC<RouteContext<{ id: string }>>(
  async (request: Request, ctx: WorkspaceContext, routeContext) => {
    const { id } = await routeContext.params
    if (!id) {
      return ApiResponse.error("缺少询盘 ID", 400)
    }

    try {
      const rawBody = await request.json()
      const { style = 'formal', language = 'en' } = rawBody as { style?: 'formal' | 'friendly', language?: 'en' | 'zh' }

      // 1. 查询询盘
      const inquiry = await prisma.inquiry.findFirst({
        where: {
          id,
          workspaceId: ctx.workspaceId
        }
      })
      if (!inquiry) {
        return ApiResponse.error("询盘不存在", 404)
      }

      // 2. 策略路由选择模型
      const routing = await selectModel({
        taskType: "chat",
        riskLevel: "low",
        estimatedTokens: 1000,
        workspaceId: ctx.workspaceId
      })

      const schema = {
        type: "object",
        properties: {
          subject: { type: "string", description: "开发信的邮件主题" },
          body: { type: "string", description: "开发信的邮件正文" }
        },
        required: ["subject", "body"],
        additionalProperties: false
      }

      const systemPrompt = `你是一个外贸开发信写作专家。根据客户背景和产品信息，生成个性化、专业的开发信。
要求：简洁有力，突出价值主张，有明确的 CTA (Call to Action)。
根据用户的偏好：
- 风格 (style)：${style === 'friendly' ? '友好生动 (friendly)' : '正式专业 (formal)'}
- 语言 (language)：${language === 'zh' ? '中文 (Chinese)' : '英文 (English)'}

输出的 JSON 对象必须严格包含以下字段：
- subject: 邮件的主题
- body: 邮件的正文

只输出符合 schema 的 JSON，不要有任何 Markdown 包裹或额外说明。`

      const userPrompt = `客户公司名：${inquiry.companyName}
客户国家/地区：${inquiry.fromCountry}
询盘概要与产品信息：
${inquiry.summary}`

      let responseJson: any = null

      // 3. 执行 LLM 生成
      if (routing.provider === "anthropic") {
        responseJson = await callAnthropicStructured({
          systemPrompt,
          userPrompt,
          schema: schema as any,
          model: routing.model
        })
      } else {
        responseJson = await callDeepSeekJson({
          systemPrompt,
          userPrompt,
          model: routing.model
        })
      }

      if (!responseJson || typeof responseJson !== 'object' || !responseJson.subject || !responseJson.body) {
        throw new Error("模型返回的内容格式不正确")
      }

      // 4. 写入审计日志
      const actor = await actorFromSession()
      await auditedWrite(
        {
          actor,
          action: "connector.execute",
          targetType: "inquiry",
          targetId: id,
          detail: `生成外贸开发信: ${style} - ${language}`,
          riskLevel: "low",
          workspaceId: ctx.workspaceId,
          automationLevel: "L2",
          triggeredBy: "user",
          contextSnapshot: {
            inquiryId: id,
            style,
            language,
            provider: routing.provider,
            model: routing.model,
            subject: responseJson.subject
          }
        },
        async () => {
          // 不需要写入其他数据库表，直接返回 true
          return true
        }
      )

      return ApiResponse.ok({
        subject: responseJson.subject,
        body: responseJson.body,
        version: 1
      })

    } catch (error) {
      logger.error("POST /api/inquiries/[id]/generate-email: 失败", {
        inquiryId: id,
        error: error instanceof Error ? error.message : "未知错误"
      })
      return ApiResponse.error(error instanceof Error ? error.message : "生成开发信失败", 500)
    }
  },
  "MEMBER"
)

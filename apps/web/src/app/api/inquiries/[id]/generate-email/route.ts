import { prisma } from "@/lib/prisma"; import { logger } from '@/lib/logger'
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"; import { actorFromSession } from "@/lib/server/audit"
import { auditedWrite } from "@/lib/server/audited-write"; import { ApiResponse } from "@/lib/server/api-response"
import { selectModel } from "@/lib/server/model-router"; import { callAnthropicStructured, callDeepSeekJson } from "@/lib/server/llm-provider"

export const POST = withRBAC<RouteContext<{ id: string }>>(async (request: Request, ctx: WorkspaceContext, routeContext) => {
  const { id } = await routeContext.params
  if (!id) return ApiResponse.error("缺少询盘 ID", 400)
  try {
    const { style = 'formal', language = 'en' } = await request.json() as any
    const inquiry = await prisma.inquiry.findFirst({ where: { id, workspaceId: ctx.workspaceId } })
    if (!inquiry) return ApiResponse.error("询盘不存在", 404)
    const routing = await selectModel({ taskType: "chat", riskLevel: "low", estimatedTokens: 1000, workspaceId: ctx.workspaceId })
    const schema = { type: "object", properties: { subject: { type: "string" }, body: { type: "string" } }, required: ["subject", "body"], additionalProperties: false }
    const systemPrompt = `你是外贸开发信写作专家。收到询盘后生成个性化开发信。${style === 'friendly' ? '友好生动' : '正式专业'}风格，${language === 'zh' ? '中文' : '英文'}回复。只输出JSON，不要Markdown包裹。`
    const userPrompt = `客户：${inquiry.companyName}，国家：${inquiry.fromCountry}，询盘概要：${inquiry.summary}`
    let responseJson: any = routing.provider === "anthropic" ? await callAnthropicStructured({ systemPrompt, userPrompt, schema, model: routing.model }) : await callDeepSeekJson({ systemPrompt, userPrompt, model: routing.model })
    if (!responseJson?.subject || !responseJson?.body) throw new Error("模型返回内容格式不正确")
    const actor = await actorFromSession()
    await auditedWrite({ actor, action: "connector.execute", targetType: "inquiry", targetId: id, detail: `生成开发信: ${style}-${language}`, riskLevel: "low", workspaceId: ctx.workspaceId, automationLevel: "L2", triggeredBy: "user" }, async () => true)
    return ApiResponse.ok({ subject: responseJson.subject, body: responseJson.body, version: 1 })
  } catch (error) { logger.error("generate-email: 失败", { inquiryId: id, error: error instanceof Error ? error.message : "未知错误" }); return ApiResponse.error(error instanceof Error ? error.message : "生成开发信失败", 500) }
}, "MEMBER")

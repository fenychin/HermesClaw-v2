import { prisma } from "@/lib/prisma"; import { logger } from "@/lib/logger"
import { successResponse, errorResponse, parseJsonField } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { buildWorkspaceContext, guardRole } from "@/lib/workspace"; import { z } from "zod"

const ProviderEnum = z.enum(["anthropic", "deepseek"])
const UpdateSettingsSchema = z.object({ defaultModel: z.string().min(1).max(100), taskProviderMap: z.object({ chat: ProviderEnum.optional(), workflow: ProviderEnum.optional(), analysis: ProviderEnum.optional(), generation: ProviderEnum.optional() }).default({}), workflowEngine: z.enum(["local", "hermes"]).default("local") })

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const row = await prisma.workspaceSettings.findUnique({ where: { workspaceId: ctx.workspaceId } })
    if (!row) return successResponse({ defaultModel: "deepseek-chat", taskProviderMap: {}, workflowEngine: "local" })
    return successResponse({ defaultModel: row.defaultModel, taskProviderMap: parseJsonField(row.taskProviderMap, {}), workflowEngine: row.workflowEngine })
  } catch (error) { logger.error("GET /api/workspace/settings: 失败", { error: error instanceof Error ? error.message : "未知错误" }); return errorResponse("服务器内部错误") }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const guard = guardRole(ctx.role, "ADMIN"); if (guard) return guard
    const body = await request.json(); const parsed = UpdateSettingsSchema.safeParse(body)
    if (!parsed.success) return errorResponse(parsed.error.issues.map(i => i.message).join("；"), 400)
    const saved = await prisma.workspaceSettings.upsert({ where: { workspaceId: ctx.workspaceId }, create: { workspaceId: ctx.workspaceId, defaultModel: parsed.data.defaultModel, taskProviderMap: JSON.stringify(parsed.data.taskProviderMap), workflowEngine: parsed.data.workflowEngine }, update: { defaultModel: parsed.data.defaultModel, taskProviderMap: JSON.stringify(parsed.data.taskProviderMap), workflowEngine: parsed.data.workflowEngine } })
    void writeAuditLog({ actor: await actorFromSession(), action: "update.model-routing", targetType: "workspace", targetId: ctx.workspaceId, detail: `更新模型路由` , riskLevel: "medium", workspaceId: ctx.workspaceId })
    return successResponse({ defaultModel: saved.defaultModel, taskProviderMap: parseJsonField(saved.taskProviderMap, {}), workflowEngine: saved.workflowEngine })
  } catch (error) { logger.error("PATCH /api/workspace/settings: 失败", { error: error instanceof Error ? error.message : "未知错误" }); return errorResponse("服务器内部错误") }
}

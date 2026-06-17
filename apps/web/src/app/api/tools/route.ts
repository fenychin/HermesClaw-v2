import { prisma } from "@/lib/prisma"; import { logger } from '@/lib/logger'
import { parseJsonField, stringifyJsonField, successResponse, errorResponse } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { ToolCreateSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"
export const runtime = "nodejs"

function serializeTool(tool: any) { return { ...tool, scopes: parseJsonField(tool.scopes, []) } }

export async function GET(request: Request) {
  try { const ctx = await buildWorkspaceContext(request); const tools = await prisma.toolRegistry.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" } }); return successResponse({ tools: tools.map((t: any) => serializeTool(t)) }) }
  catch (error) { logger.error('GET /api/tools: 失败'); return errorResponse("服务器内部错误") }
}

export async function POST(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role); const rawBody = await request.json()
    const parsed = validateBody(rawBody, ToolCreateSchema); if (parsed instanceof Response) return parsed; const body = parsed
    const tool = await prisma.toolRegistry.create({ data: { name: body.name, description: body.description, category: body.category, scopes: stringifyJsonField(body.scopes), riskLevel: body.riskLevel, enabled: body.enabled, workspaceId: ctx.workspaceId } })
    void writeAuditLog({ actor: await actorFromSession(), action: "register.tool", targetType: "tool", targetId: tool.id, detail: `${tool.name}`, riskLevel: tool.riskLevel === "high" ? "high" : "low", workspaceId: ctx.workspaceId })
    return successResponse({ tool: serializeTool(tool) }, 201)
  } catch (error) { if (error instanceof Error && error.message.includes("Unique")) return errorResponse("同名工具已注册", 409); return errorResponse("服务器内部错误") }
}

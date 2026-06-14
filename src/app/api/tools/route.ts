/**
 * /api/tools —— 工具注册表（AGENTS.md 4.3 受控工具接入）
 *   GET  列出所有注册工具
 *   POST 注册一个新工具
 */
import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  parseJsonField,
  stringifyJsonField,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/shared/audit"
import { ToolCreateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"

export const runtime = "nodejs"

/** 序列化 ToolRegistry，反序列化 scopes */
function serializeTool(tool: Record<string, unknown>) {
  return {
    ...tool,
    scopes: parseJsonField(tool.scopes as string, []),
  }
}

/** GET /api/tools —— 工具列表 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const tools = await prisma.toolRegistry.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
    })
    return successResponse({
      tools: tools.map((t) => serializeTool(t as unknown as Record<string, unknown>)),
    })
  } catch (error) {
    logger.error('GET /api/tools: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** POST /api/tools —— 注册新工具 */
export async function POST(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, ToolCreateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const tool = await prisma.toolRegistry.create({
      data: {
        name: body.name,
        description: body.description,
        category: body.category,
        scopes: stringifyJsonField(body.scopes),
        riskLevel: body.riskLevel,
        enabled: body.enabled,
        workspaceId: ctx.workspaceId,
      },
    })

    await writeAuditLog({
      actor: await actorFromSession(),
      action: "register.tool",
      targetType: "tool",
      targetId: tool.id,
      detail: `${tool.name} · ${tool.riskLevel}`,
      riskLevel: tool.riskLevel === "high" ? "high" : "low",
      workspaceId: ctx.workspaceId,
    })

    return successResponse(
      { tool: serializeTool(tool as unknown as Record<string, unknown>) },
      201,
    )
  } catch (error) {
    logger.error('POST /api/tools: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    // name 唯一约束冲突
    if (error instanceof Error && error.message.includes("Unique")) {
      return errorResponse("同名工具已注册", 409)
    }
    return errorResponse("服务器内部错误")
  }
}

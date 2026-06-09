import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  parseJsonField,
  stringifyJsonField,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { MemoryCreateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext } from "@/lib/workspace"

/** 序列化 Memory，将 JSON 字符串字段反序列化 */
function serializeMemory(memory: Record<string, unknown>) {
  return {
    ...memory,
    tags: parseJsonField(memory.tags as string, []),
  }
}

/** GET /api/memory?type=short|mid|long —— 获取记忆列表，支持类型过滤 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type")

    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }
    if (type) where.type = type

    const memories = await prisma.memory.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })

    return successResponse({
      memories: memories.map((m) => serializeMemory(m as unknown as Record<string, unknown>)),
    })
  } catch (error) {
    logger.error('GET /api/memory: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** POST /api/memory —— 创建新记忆 */
export async function POST(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, MemoryCreateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const memory = await prisma.memory.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId: ctx.workspaceId,
        type: body.type,
        content: body.content,
        summary: body.summary,
        source: body.source,
        relatedProject: body.relatedProject,
        relatedAgent: body.relatedAgent,
        confidence: body.confidence,
        frozen: body.frozen,
        tags: stringifyJsonField(body.tags),
        projectId: body.projectId,
      },
    })

    await writeAuditLog({
      actor: await actorFromSession(),
      action: "create.memory",
      targetType: "memory",
      targetId: memory.id,
      detail: `${memory.type} · ${memory.summary}`,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
    })

    return successResponse(
      { memory: serializeMemory(memory as unknown as Record<string, unknown>) },
      201,
    )
  } catch (error) {
    logger.error('POST /api/memory: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

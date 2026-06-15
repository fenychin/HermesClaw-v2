import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  serializeMemory,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { actorFromSession } from "@/lib/server/shared/audit"
import { MemoryCreateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"
import { guardOutput } from "@/lib/server/shared/output-guard"
import { MemoryService } from "@/lib/server/hermes/memory-service"

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
    requireWritable(ctx.role)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, MemoryCreateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    // 引入安全护栏扫描（AGENTS.md 第五章：防注入与安全边界）
    const guard = guardOutput(body.content, { minLength: 3, maxLength: 8000 })
    if (!guard.ok) {
      return errorResponse(`知识库文本不合规：${guard.reason}`, 400)
    }

    const actor = await actorFromSession()
    const memory = await MemoryService.createMemory(
      ctx.workspaceId,
      {
        type: body.type,
        content: body.content,
        summary: body.summary,
        source: body.source,
        relatedProject: body.relatedProject,
        relatedAgent: body.relatedAgent,
        confidence: body.confidence,
        frozen: body.frozen,
        tags: body.tags,
        projectId: body.projectId,
      },
      actor
    )


    return successResponse(
      { memory: serializeMemory(memory as unknown as Record<string, unknown>) },
      201,
    )
  } catch (error) {
    logger.error('POST /api/memory: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

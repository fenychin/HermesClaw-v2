import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  serializeMemory,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { MemoryCreateSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"
import { guardOutput } from "@/lib/server/output-guard"
import { MemoryService } from "@/lib/server/memory-service"

/** GET /api/memory —— 获取记忆列表，支持 scope 分页过滤 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const { searchParams } = new URL(request.url)
    const scope = searchParams.get("scope")
    const projectId = searchParams.get("projectId")
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "30", 10)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      workspaceId: ctx.workspaceId,
      status: "active", // 过滤软删除的记忆
    }

    if (scope) {
      if (scope === "org") {
        where.type = "long"
      } else if (scope === "project") {
        where.type = "mid"
        if (projectId) {
          where.projectId = projectId
        }
      } else if (scope === "session") {
        where.type = "short"
      }
    } else if (projectId) {
      where.projectId = projectId
    }

    const [memories, total] = await Promise.all([
      prisma.memory.findMany({
        where,
        include: {
          _count: {
            select: { revisions: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.memory.count({ where }),
    ])

    const serialized = memories.map((m) => {
      const parsedTags = (() => {
        try {
          return JSON.parse(m.tags || "[]")
        } catch {
          return []
        }
      })()

      return {
        id: m.id,
        workspaceId: m.workspaceId,
        projectId: m.projectId,
        type: m.type,
        content: m.content.length > 200 ? m.content.substring(0, 200) + "..." : m.content,
        rawContent: m.content, // 保留原内容以便展开
        summary: m.summary,
        source: m.source,
        tags: parsedTags,
        version: m.version,
        revisionCount: m._count.revisions,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      }
    })

    return successResponse({
      memories: serialized,
      total,
      page,
      limit,
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

    // 自适应将 scope 映射为 type 字段
    if (rawBody.scope) {
      if (rawBody.scope === "org") rawBody.type = "long"
      else if (rawBody.scope === "project") rawBody.type = "mid"
      else if (rawBody.scope === "session") rawBody.type = "short"
    }

    // 默认生成 summary
    if (!rawBody.summary && rawBody.content) {
      rawBody.summary = rawBody.content.length > 50 ? rawBody.content.substring(0, 50) + "..." : rawBody.content
    }

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
        source: body.source || "manual",
        relatedProject: body.relatedProject,
        relatedAgent: body.relatedAgent,
        confidence: body.confidence,
        frozen: body.frozen,
        tags: body.tags,
        projectId: body.projectId,
      },
      actor
    )

    // 显式写入 memory.created 审计日志以满足要求
    await writeAuditLog({
      actor,
      action: "memory.created",
      targetType: "memory",
      targetId: memory.id,
      detail: `手动创建记忆条目 (${memory.type}): ${memory.summary}`,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
    }).catch(() => {})

    const parsedTags = (() => {
      try {
        return JSON.parse(memory.tags || "[]")
      } catch {
        return []
      }
    })()

    return successResponse(
      {
        memory: {
          id: memory.id,
          workspaceId: memory.workspaceId,
          projectId: memory.projectId,
          type: memory.type,
          content: memory.content,
          summary: memory.summary,
          source: memory.source,
          tags: parsedTags,
          version: memory.version,
          revisionCount: 1,
          createdAt: memory.createdAt.toISOString(),
          updatedAt: memory.updatedAt.toISOString(),
        }
      },
      201,
    )
  } catch (error) {
    logger.error('POST /api/memory: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

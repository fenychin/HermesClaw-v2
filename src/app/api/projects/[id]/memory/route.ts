import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { serializeMemory, successResponse, errorResponse } from "@/lib/api-utils"
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { findProjectOrThrow } from "@/lib/server/project-helpers"
import type { WorkspaceContext } from "@/lib/workspace"

/**
 * GET /api/projects/[id]/memory —— 获取项目空间中短期记忆列表
 * —— 强制 workspaceId + projectId 双重过滤（AGENTS.md §4.11 数据隔离）
 * —— 返回按创建时间倒序的记忆条目
 * —— RBAC: VIEWER
 */
export const GET = withRBAC<RouteContext<{ id: string }>>(async (
  _request: Request,
  ctx: WorkspaceContext,
  routeCtx: RouteContext<{ id: string }>,
) => {
  try {
    const { id: projectId } = await routeCtx.params

    // 先校验项目存在且属于当前 workspace（共享 helper）
    const project = await findProjectOrThrow(projectId, ctx)
    if (project instanceof Response) return project

    const memories = await prisma.memory.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        projectId,
      },
      orderBy: { createdAt: "desc" },
    })

    return successResponse({
      memories: memories.map((m) => serializeMemory(m as unknown as Record<string, unknown>)),
    })
  } catch (error) {
    logger.error("GET /api/projects/[id]/memory: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}, "VIEWER")

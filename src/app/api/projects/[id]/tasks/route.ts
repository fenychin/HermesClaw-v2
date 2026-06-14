import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { withRBAC, type RouteContext } from "@/lib/server/shared/api-handler"
import { findProjectOrThrow } from "@/lib/server/hermes/project-helpers"
import type { WorkspaceContext } from "@/lib/workspace"

/**
 * GET /api/projects/[id]/tasks —— 获取项目关联任务列表
 * —— 强制 workspaceId + projectId 双重过滤（AGENTS.md §4.11 数据隔离）
 * —— 支持 ?status= / ?priority= 可选筛选
 * —— RBAC: VIEWER
 */
export const GET = withRBAC<RouteContext<{ id: string }>>(async (
  request: Request,
  ctx: WorkspaceContext,
  routeCtx: RouteContext<{ id: string }>,
) => {
  try {
    const { id: projectId } = await routeCtx.params
    const url = new URL(request.url)
    const status = url.searchParams.get("status") || undefined
    const priority = url.searchParams.get("priority") || undefined

    // 先校验项目存在且属于当前 workspace（共享 helper）
    const project = await findProjectOrThrow(projectId, ctx)
    if (project instanceof Response) return project

    // 构建 where 条件：workspace 隔离 + projectId 过滤
    const where: Record<string, unknown> = {
      workspaceId: ctx.workspaceId,
      projectId,
    }
    if (status) where.status = status
    if (priority) where.priority = priority

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })

    return successResponse({ tasks })
  } catch (error) {
    logger.error("GET /api/projects/[id]/tasks: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}, "VIEWER")

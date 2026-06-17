import { prisma } from "@/lib/prisma"; import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { findProjectOrThrow } from "@/lib/server/project-helpers"
import type { WorkspaceContext } from "@/lib/workspace"

export const GET = withRBAC<RouteContext<{ id: string }>>(async (request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
  try {
    const { id: projectId } = await routeCtx.params; const url = new URL(request.url)
    const project = await findProjectOrThrow(projectId, ctx); if (project instanceof Response) return project
    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId, projectId }
    const status = url.searchParams.get("status"); if (status) where.status = status
    const priority = url.searchParams.get("priority"); if (priority) where.priority = priority
    const tasks = await prisma.task.findMany({ where, orderBy: { createdAt: "desc" } })
    return successResponse({ tasks })
  } catch (error) { logger.error("GET /api/projects/[id]/tasks: 失败"); return errorResponse("服务器内部错误") }
}, "VIEWER")

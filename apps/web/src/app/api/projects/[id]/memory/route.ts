import { prisma } from "@/lib/prisma"; import { logger } from "@/lib/logger"
import { serializeMemory, successResponse, errorResponse } from "@/lib/api-utils"
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { findProjectOrThrow } from "@/lib/server/project-helpers"; import type { WorkspaceContext } from "@/lib/workspace"

export const GET = withRBAC<RouteContext<{ id: string }>>(async (_request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
  try {
    const { id: projectId } = await routeCtx.params
    const project = await findProjectOrThrow(projectId, ctx); if (project instanceof Response) return project
    const memories = await prisma.memory.findMany({ where: { workspaceId: ctx.workspaceId, projectId }, orderBy: { createdAt: "desc" } })
    return successResponse({ memories: memories.map((m: any) => serializeMemory(m as any)) })
  } catch (error) { logger.error("GET /api/projects/[id]/memory: 失败"); return errorResponse("服务器内部错误") }
}, "VIEWER")

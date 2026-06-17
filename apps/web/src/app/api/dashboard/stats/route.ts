import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import type { WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import { getDashboardStats, type DashboardHandlerDeps } from "@hermesclaw/hermes-kernel"

const handlerDeps: DashboardHandlerDeps = { prisma } as DashboardHandlerDeps

export const GET = withRBAC(async (_request: Request, ctx: WorkspaceContext) => {
  try {
    return successResponse(await getDashboardStats({ workspaceId: ctx.workspaceId }, handlerDeps))
  } catch (error) {
    logger.error("GET /api/dashboard/stats: 失败", { error: error instanceof Error ? error.message : "未知错误" })
    return errorResponse("服务器内部错误")
  }
}, "VIEWER")

import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { RouteContext, withRBAC } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { validateBody, AgentExecuteSchema } from "@/lib/server/validators"
import { executeAgentAction, AgentExecuteError } from "@/lib/server/agent-execute-service"

export const POST = withRBAC<RouteContext<{ id: string }>>(async (request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
  try {
    const { id } = await routeCtx.params
    const parsed = validateBody(await request.json(), AgentExecuteSchema); if (parsed instanceof Response) return parsed
    return successResponse(await executeAgentAction({ agentId: id, workspaceId: ctx.workspaceId, industryId: ctx.industryId, action: parsed.action }))
  } catch (e) {
    if (e instanceof AgentExecuteError) return errorResponse(e.message, e.httpStatus)
    logger.error('POST /api/agents/[id]/execute: 失败')
    return errorResponse(`执行失败：${e instanceof Error ? e.message : "未知错误"}`, 500)
  }
}, "MEMBER")

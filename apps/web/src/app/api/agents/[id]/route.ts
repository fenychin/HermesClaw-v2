import { prisma } from "@/lib/prisma"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { AgentUpdateSchema, validateBody } from "@/lib/server/validators"
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { serializeAgent } from "@/lib/server/agent-serializer"
import { patchAgent, deleteAgent, AgentMutationError } from "@/lib/server/agent-mutations"
import { ForbiddenError } from "@/lib/workspace"

function handleErr(e: unknown) { 
  if (e instanceof AgentMutationError) return e.response ?? errorResponse(e.message, e.httpStatus); 
  if (e instanceof ForbiddenError) return errorResponse(e.message, 403); 
  return errorResponse("服务器内部错误") 
}

export const GET = withRBAC<RouteContext<{ id: string }>>(
  async (request, ctx, routeContext) => {
    try {
      const { id } = await routeContext.params
      const agent = await prisma.agent.findUnique({ 
        where: { id, workspaceId: ctx.workspaceId }, 
        include: { runLogs: { orderBy: { createdAt: "desc" } } } 
      })
      if (!agent) return errorResponse("智能体不存在", 404)
      return successResponse({ agent: serializeAgent(agent as any) })
    } catch { 
      return errorResponse("服务器内部错误") 
    }
  }, 
  'VIEWER'
)

export const PATCH = withRBAC<RouteContext<{ id: string }>>(
  async (request, ctx, routeContext) => {
    try {
      const { id } = await routeContext.params
      const parsed = validateBody(await request.json(), AgentUpdateSchema)
      if (parsed instanceof Response) return parsed
      return successResponse({ 
        agent: serializeAgent(await patchAgent(id, ctx.workspaceId, parsed) as any) 
      })
    } catch (e) { 
      return handleErr(e) 
    }
  }, 
  'MEMBER'
)

export const DELETE = withRBAC<RouteContext<{ id: string }>>(
  async (request, ctx, routeContext) => {
    try {
      const { id } = await routeContext.params
      return successResponse(await deleteAgent(id, ctx.workspaceId, request))
    } catch (e) { 
      return handleErr(e) 
    }
  }, 
  'ADMIN'
)

import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { getOrchestrationSession } from '@/lib/server/orchestrator'

export const GET = withRBAC(
  async (req: Request, ctx: any, routeCtx: any) => {
    const { sessionId } = await routeCtx.params

    try {
      const session = await getOrchestrationSession(sessionId, ctx.workspaceId)
      if (!session) {
        return ApiResponse.error("Session not found", 404)
      }
      return ApiResponse.ok(session)
    } catch (err: any) {
      return ApiResponse.error(err.message, 400)
    }
  },
  'MEMBER'
)

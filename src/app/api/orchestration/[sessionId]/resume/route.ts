import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { resumeOrchestrationSession } from '@/lib/server/orchestrator'

export const POST = withRBAC(
  async (req: Request, ctx: any, routeCtx: any) => {
    const { sessionId } = await routeCtx.params

    let body: any = {}
    try {
      const text = await req.text()
      if (text) {
        body = JSON.parse(text)
      }
    } catch {
      // ignore
    }

    if (body.approved === undefined) {
      return ApiResponse.error("Missing 'approved' field in body", 400)
    }

    try {
      const session = await resumeOrchestrationSession(
        sessionId,
        ctx.workspaceId,
        body.approved,
        ctx.userId || 'system'
      )
      return ApiResponse.ok(session)
    } catch (err: any) {
      return ApiResponse.error(err.message, 400)
    }
  },
  'MEMBER'
)

import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { getWorkflowRunStatus } from '@/lib/server/workflow/runtime-engine'

export const GET = withRBAC(
  async (req: Request, ctx: any, routeCtx: any) => {
    const { id } = await routeCtx.params

    try {
      const status = await getWorkflowRunStatus(id, ctx.workspaceId)
      return ApiResponse.ok(status)
    } catch (err: any) {
      return ApiResponse.error(err.message, 404)
    }
  },
  'MEMBER'
)

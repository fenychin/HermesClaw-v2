import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { executeWorkflowRun } from '@/lib/server/workflow/runtime-engine'

export const POST = withRBAC(
  async (req: Request, ctx: any, routeCtx: any) => {
    const { id } = await routeCtx.params

    // 异步触发执行，立即返回 runId
    executeWorkflowRun(id, ctx.workspaceId).catch(() => {})

    return ApiResponse.ok({ runId: id })
  },
  'MEMBER'
)

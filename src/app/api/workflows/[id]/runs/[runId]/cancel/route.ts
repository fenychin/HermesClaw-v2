import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { cancelWorkflowRun } from '@/lib/server/workflow/runtime-engine'
import { checkConfirmValue } from '@/lib/server/guardrail'

export const POST = withRBAC(
  async (req: Request, ctx: any, routeCtx: any) => {
    const { runId } = await routeCtx.params

    let body: any = {}
    try {
      const text = await req.text()
      if (text) {
        body = JSON.parse(text)
      }
    } catch {
      // ignore
    }

    // Guardrail 二次确认
    const guard = await checkConfirmValue(body.confirm, "取消工作流运行需要二次确认")
    if (!guard.ok) {
      return guard.response
    }

    try {
      const run = await cancelWorkflowRun(runId, ctx.workspaceId, ctx.userId || 'system')
      return ApiResponse.ok(run)
    } catch (err: any) {
      return ApiResponse.error(err.message, 400)
    }
  },
  'MEMBER'
)

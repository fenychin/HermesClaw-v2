import { ApiResponse } from '@/lib/server/api-response'; import { withRBAC } from '@/lib/server/api-handler'
import { cancelWorkflowRun } from '@/lib/server/workflow/runtime-engine'; import { writeAuditLog } from '@/lib/server/audit'

export const POST = withRBAC(async (req: Request, ctx: any, routeCtx: any) => {
  const { id } = await routeCtx.params
  let body: any = {}; try { const text = await req.text(); if (text) body = JSON.parse(text) } catch {}
  try {
    const run = await cancelWorkflowRun(id, ctx.workspaceId, ctx.userId || 'system')
    void writeAuditLog({ actor: ctx.userId || 'system', action: 'task.cancel', targetType: 'workflowRun', targetId: run.id, detail: `取消工作流: ${body.reason || '用户取消'}`, riskLevel: 'low', workspaceId: ctx.workspaceId })
    return ApiResponse.ok(run)
  } catch (err: any) { return ApiResponse.error(err.message, 400) }
}, 'MEMBER')

import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { cancelWorkflowRun } from '@/lib/server/workflow/runtime-engine'
import { writeAuditLog } from '@/lib/server/audit'

export const POST = withRBAC(
  async (req: Request, ctx: any, routeCtx: any) => {
    const { id } = await routeCtx.params

    let body: any = {}
    try {
      const text = await req.text()
      if (text) {
        body = JSON.parse(text)
      }
    } catch {
      // ignore
    }

    const reason = body.reason || '用户手动取消'

    try {
      const run = await cancelWorkflowRun(id, ctx.workspaceId, ctx.userId || 'system')

      // 写入 AuditLog 记录 task.cancel
      await writeAuditLog({
        actor: ctx.userId || 'system',
        action: 'task.cancel',
        targetType: 'workflowRun',
        targetId: run.id, // 物理主键 ID
        detail: `取消工作流运行: ${reason}`,
        riskLevel: 'low',
        workspaceId: ctx.workspaceId
      })

      return ApiResponse.ok(run)
    } catch (err: any) {
      return ApiResponse.error(err.message, 400)
    }
  },
  'MEMBER'
)

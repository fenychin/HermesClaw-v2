import { withRBAC } from "@/lib/server/api-handler"; import { checkConfirmValue } from "@/lib/server/guardrail"
import { executeRollback, listRollbacks, formatRollbackError, RollbackStatus } from "@/lib/server/rollback"

export const GET = withRBAC(async (request: any, ctx: any) => {
  try {
    const { searchParams } = new URL(request.url)
    const result = await listRollbacks(ctx.workspaceId, { agentId: searchParams.get("agentId") || undefined, status: (searchParams.get("status") as RollbackStatus) || undefined })
    return Response.json({ success: true, data: result })
  } catch (error) { return Response.json({ success: false, error: error instanceof Error ? error.message : "获取回滚列表失败" }, { status: 500 }) }
}, "VIEWER")

export const POST = withRBAC(async (request: any, ctx: any) => {
  try {
    let body: any = {}; try { body = await request.json() } catch { return Response.json({ success: false, error: "请求体必须为 JSON" }, { status: 400 }) }
    const { canaryId, reason, triggeredBy, confirm } = body
    if (!canaryId || !reason) return Response.json({ success: false, error: "缺少必要字段" }, { status: 400 })
    const confirmResult = await checkConfirmValue(confirm, "手动触发回滚属于高危变更，需要二次确认")
    if (!confirmResult.ok) return confirmResult.response
    const rollback = await executeRollback({ canaryId, workspaceId: ctx.workspaceId, reason, triggerType: "manual", triggeredBy: confirmResult.actor || triggeredBy || "system" })
    return Response.json({ success: true, data: rollback })
  } catch (error) { return formatRollbackError(error) }
}, "ADMIN")

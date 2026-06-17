import { withRBAC } from "@/lib/server/api-handler"; import type { RouteContext } from "@/lib/server/api-handler"
import { checkConfirmValue } from "@/lib/server/guardrail"; import { retryFailedRollback, formatRollbackError } from "@/lib/server/rollback"

export const POST = withRBAC<RouteContext<{ id: string }>>(async (request: any, ctx: any, routeContext: RouteContext<{ id: string }>) => {
  try {
    const { id } = await routeContext.params; if (!id) return Response.json({ success: false, error: "缺少回滚记录ID" }, { status: 400 })
    let body: any = {}; try { body = await request.json() } catch {}
    const confirmResult = await checkConfirmValue(body.confirm, "重试回滚属于高危变更，需要二次确认")
    if (!confirmResult.ok) return confirmResult.response
    const rollback = await retryFailedRollback(id, confirmResult.actor || body.retriedBy || "system")
    return Response.json({ success: true, data: rollback })
  } catch (error) { return formatRollbackError(error) }
}, "ADMIN")

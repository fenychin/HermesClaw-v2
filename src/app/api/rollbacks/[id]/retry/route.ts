import { withRBAC } from "@/lib/server/api-handler"
import type { RouteContext } from "@/lib/server/api-handler"
import { checkConfirmValue } from "@/lib/server/guardrail"
import {
  retryFailedRollback,
  formatRollbackError
} from "@/lib/server/rollback"

/**
 * POST /api/rollbacks/[id]/retry
 * 重新执行一个失败的回滚操作（高危操作，需要二次确认）
 * RBAC: ADMIN 及以上
 */
export const POST = withRBAC<RouteContext<{ id: string }>>(
  async (request, ctx, routeContext) => {
    try {
      const params = await routeContext.params
      const id = params.id

      if (!id) {
        return Response.json(
          { success: false, error: "缺少回滚记录ID" },
          { status: 400 }
        )
      }

      let body: { confirm?: unknown; retriedBy?: string } = {}
      try {
        body = await request.json()
      } catch {
        // 允许空 body，但 L3 仍必须传入 confirm: true，所以还是需要 JSON 解析
      }

      const { confirm, retriedBy } = body

      // 1. 高危操作防线：使用 guardrail 的 checkConfirmValue 校验二次确认 (confirm === true)
      const confirmResult = await checkConfirmValue(confirm, "重试回滚属于高危变更，需要显式进行二次确认")
      if (!confirmResult.ok) {
        return confirmResult.response
      }

      const actor = confirmResult.actor || retriedBy || "system"

      // 2. 调用重试服务
      const rollback = await retryFailedRollback(id, actor)

      return Response.json({
        success: true,
        data: rollback
      })
    } catch (error) {
      return formatRollbackError(error)
    }
  },
  "ADMIN"
)

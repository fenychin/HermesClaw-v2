import { withRBAC } from "@/lib/server/api-handler"
import { checkConfirmValue } from "@/lib/server/guardrail"
import {
  executeRollback,
  listRollbacks,
  formatRollbackError,
  RollbackStatus
} from "@/lib/server/rollback"

/**
 * GET /api/rollbacks
 * 查询当前 workspace 下的回滚历史列表
 * RBAC: MEMBER 及以上
 */
export const GET = withRBAC(
  async (request, ctx) => {
    try {
      const { searchParams } = new URL(request.url)
      const agentId = searchParams.get("agentId") || undefined
      const status = (searchParams.get("status") as RollbackStatus) || undefined
      const pageStr = searchParams.get("page")
      const pageSizeStr = searchParams.get("pageSize")
      
      const page = pageStr ? parseInt(pageStr, 10) : undefined
      const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : undefined

      const result = await listRollbacks(ctx.workspaceId, {
        agentId,
        status,
        page: (page !== undefined && !isNaN(page)) ? page : undefined,
        pageSize: (pageSize !== undefined && !isNaN(pageSize)) ? pageSize : undefined
      })

      return Response.json({
        success: true,
        data: result
      })
    } catch (error) {
      return Response.json(
        { success: false, error: error instanceof Error ? error.message : "获取回滚列表失败" },
        { status: 500 }
      )
    }
  },
  "MEMBER"
)

/**
 * POST /api/rollbacks
 * 手动触发一个 Harness 回滚操作（高危操作，需要二次确认）
 * RBAC: ADMIN 及以上
 */
export const POST = withRBAC(
  async (request, ctx) => {
    try {
      let body: { canaryId?: string; reason?: string; triggeredBy?: string; confirm?: unknown } = {}
      try {
        body = await request.json()
      } catch {
        return Response.json(
          { success: false, error: "请求体必须为有效的 JSON 格式" },
          { status: 400 }
        )
      }

      const { canaryId, reason, triggeredBy, confirm } = body

      if (!canaryId) {
        return Response.json(
          { success: false, error: "缺少必要字段: canaryId" },
          { status: 400 }
        )
      }

      if (!reason) {
        return Response.json(
          { success: false, error: "缺少必要字段: reason" },
          { status: 400 }
        )
      }

      // 1. 高危操作防线：使用 guardrail 的 checkConfirmValue 校验二次确认 (confirm === true)
      const confirmResult = await checkConfirmValue(confirm, "手动触发回滚属于高危变更，需要显式进行二次确认")
      if (!confirmResult.ok) {
        return confirmResult.response
      }

      const actor = confirmResult.actor || triggeredBy || "system"

      // 2. 执行回滚核心逻辑
      const rollback = await executeRollback({
        canaryId,
        workspaceId: ctx.workspaceId,
        reason,
        triggerType: "manual",
        triggeredBy: actor
      })

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

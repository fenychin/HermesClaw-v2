import { withRBAC } from "@/lib/server/api-handler"
import type { RouteContext } from "@/lib/server/api-handler"
import { getRollback } from "@/lib/server/rollback"

/**
 * GET /api/rollbacks/[id]
 * 获取单个回滚操作的详情
 * RBAC: MEMBER 及以上
 */
export const GET = withRBAC<RouteContext<{ id: string }>>(
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

      const rollback = await getRollback(id, ctx.workspaceId)
      if (!rollback) {
        return Response.json(
          { success: false, error: `回滚记录未找到: ${id}` },
          { status: 404 }
        )
      }

      return Response.json({
        success: true,
        data: rollback
      })
    } catch (error) {
      return Response.json(
        { success: false, error: error instanceof Error ? error.message : "获取回滚记录详情失败" },
        { status: 500 }
      )
    }
  },
  "MEMBER"
)

/**
 * GET /api/industry/[packId]/workflows/[workflowId]
 *   一次性返回 pack 内某 workflow 的完整定义：meta + dag + steps
 *
 * 由 SDK loader 装载（带进程级缓存与 Zod 强校验）；
 * 任一段缺失返回 null，调用方 UI 可据此渲染 EmptyState。
 *
 * CLAUDE.md §3.2 / §6.2：
 *   pack 是 workflow DAG / 步骤定义的 single source of truth；
 *   prisma seed 与 UI 静态 fallback 均派生自这里。
 */
import { loadIndustryWorkflow } from "@/lib/industry-pack-sdk"
import { withRBAC } from "@/lib/server/shared/api-handler"
import type { RouteContext } from "@/lib/server/shared/api-handler"
import { logger } from "@/lib/logger"

export const GET = withRBAC<RouteContext<{ packId: string; workflowId: string }>>(
  async (request, ctx, routeContext) => {
    let packId = "unknown"
    let workflowId = "unknown"
    try {
      const params = await routeContext.params
      packId = params.packId
      workflowId = params.workflowId

      const result = loadIndustryWorkflow(packId, workflowId)
      return Response.json(result)
    } catch (error: any) {
      logger.error("[API] 获取行业 workflow 完整定义失败", {
        packId,
        workflowId,
        error: error instanceof Error ? error.message : "未知错误",
      })
      const isNotFound =
        error?.message && /not found/i.test(error.message)
      return Response.json(
        { error: error?.message || "获取行业 workflow 失败" },
        { status: isNotFound ? 404 : 500 },
      )
    }
  },
  "MEMBER",
)

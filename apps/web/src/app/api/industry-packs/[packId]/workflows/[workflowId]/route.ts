import { loadIndustryWorkflow } from "@hermesclaw/industry-pack-sdk"
import { withRBAC } from "@/lib/server/api-handler"; import type { RouteContext } from "@/lib/server/api-handler"; import { logger } from "@/lib/logger"

export const GET = withRBAC<RouteContext<{ packId: string; workflowId: string }>>(async (_request: any, _ctx: any, routeContext: RouteContext<{ packId: string; workflowId: string }>) => {
  let packId = "unknown"; let workflowId = "unknown"
  try {
    const params = await routeContext.params; packId = params.packId; workflowId = params.workflowId
    return Response.json(loadIndustryWorkflow(packId, workflowId))
  } catch (error: any) { logger.error("[API] 获取 workflow 失败", { packId, workflowId, error: error.message }); return Response.json({ error: error.message }, { status: 404 }) }
}, "VIEWER")

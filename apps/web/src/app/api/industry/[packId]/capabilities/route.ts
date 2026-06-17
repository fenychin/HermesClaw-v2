import { getCachedManifest, listIndustryWorkflows, loadIndustryAgents, loadIndustrySkills, loadIndustryConnectors, loadIndustryDashboards, loadIndustrySchemas, loadIndustryEvalRules } from "@hermesclaw/industry-pack-sdk"
import { withRBAC } from "@/lib/server/api-handler"; import type { RouteContext } from "@/lib/server/api-handler"; import { logger } from "@/lib/logger"

export const GET = withRBAC<RouteContext<{ packId: string }>>(async (_request: any, _ctx: any, routeContext: RouteContext<{ packId: string }>) => {
  let packId = "unknown"
  try {
    packId = (await routeContext.params).packId
    return Response.json({ workflows: listIndustryWorkflows(packId), agents: loadIndustryAgents(packId), skills: loadIndustrySkills(packId), connectors: loadIndustryConnectors(packId), dashboards: loadIndustryDashboards(packId), schemas: loadIndustrySchemas(packId), evalRules: loadIndustryEvalRules(packId) })
  } catch (error: any) { logger.error("[API] 获取行业包能力失败", { packId, error: error.message }); return Response.json({ error: error.message }, { status: 404 }) }
}, "VIEWER")

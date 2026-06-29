import { getCachedManifest, listIndustryWorkflows, loadIndustryAgents, loadIndustrySkills, loadIndustryConnectors, loadIndustryDashboards, loadIndustrySchemas, loadIndustryEvalRules } from "@hermesclaw/industry-pack-sdk"
import { withRBAC } from "@/lib/server/api-handler"; import type { RouteContext } from "@/lib/server/api-handler"; import { logger } from "@/lib/logger"

export const GET = withRBAC<RouteContext<{ packId: string }>>(async (_request: any, _ctx: any, routeContext: RouteContext<{ packId: string }>) => {
  let packId = "unknown"
  try {
    const params = await routeContext?.params
    packId = params?.packId || "unknown"
    console.log(`[API] 开始获取行业包 ${packId} 的能力...`)

    const data = {
      workflows: listIndustryWorkflows(packId),
      agents: loadIndustryAgents(packId),
      skills: loadIndustrySkills(packId),
      connectors: loadIndustryConnectors(packId),
      dashboards: loadIndustryDashboards(packId),
      schemas: loadIndustrySchemas(packId),
      evalRules: loadIndustryEvalRules(packId)
    }
    console.log(`[API] 成功获取行业包 ${packId} 的能力`)
    return Response.json(data)
  } catch (error: any) {
    console.error("[API] 获取行业包能力失败，捕获到异常:", error)
    logger.error("[API] 获取行业包能力失败", { packId, error: error.message })
    return Response.json({ error: error.message }, { status: 500 })
  }
}, "VIEWER")


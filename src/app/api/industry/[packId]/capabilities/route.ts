import {
  getCachedManifest,
  listIndustryWorkflows,
  loadIndustryAgents,
  loadIndustrySkills,
  loadIndustryConnectors,
  loadIndustryDashboards,
  loadIndustrySchemas,
  loadIndustryEvalRules,
} from "@/lib/industry-pack-sdk"
import { withRBAC } from "@/lib/server/api-handler"
import type { RouteContext } from "@/lib/server/api-handler"
import { logger } from "@/lib/logger"

export const GET = withRBAC<RouteContext<{ packId: string }>>(
  async (request, ctx, routeContext) => {
    let packId = "unknown"
    try {
      const params = await routeContext.params
      packId = params.packId

      const workflows = listIndustryWorkflows(packId)
      const agents = loadIndustryAgents(packId)
      const skills = loadIndustrySkills(packId)
      const connectors = loadIndustryConnectors(packId)
      const dashboards = loadIndustryDashboards(packId)
      const schemas = loadIndustrySchemas(packId)
      const evalRules = loadIndustryEvalRules(packId)
      
      return Response.json({
        workflows,
        agents,
        skills,
        connectors,
        dashboards,
        schemas,
        evalRules,
      })
    } catch (error: any) {
      logger.error("[API] 获取行业包能力失败", {
        packId,
        error: error instanceof Error ? error.message : "未知错误",
      })
      const isNotFound = error.message && error.message.includes("not found")
      return Response.json(
        { error: error.message || "获取行业包能力失败" },
        { status: isNotFound ? 404 : 500 }
      )
    }
  },
  "MEMBER"
)

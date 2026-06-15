import { getCachedManifest, listIndustryWorkflows, loadIndustryAgents } from "@/lib/industry-pack-sdk"
import { withRBAC } from "@/lib/server/shared/api-handler"
import type { RouteContext } from "@/lib/server/shared/api-handler"
import { logger } from "@/lib/logger"

export const GET = withRBAC<RouteContext<{ packId: string }>>(
  async (request, ctx, routeContext) => {
    let packId = "unknown"
    try {
      const params = await routeContext.params
      packId = params.packId

      const workflows = listIndustryWorkflows(packId)
      const agents = loadIndustryAgents(packId)
      const manifest = getCachedManifest(packId)
      
      const directory = manifest.directory || {
        skills: [],
      }
      
      return Response.json({
        workflows,
        agents,
        skills: directory.skills || [],
      })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "未知错误";
      const isNotFound = error instanceof Error && error.message.includes("not found");
      logger.error("[API] 获取行业包能力失败", { packId, error: msg });
      return Response.json(
        { error: msg || "获取行业包能力失败" },
        { status: isNotFound ? 404 : 500 }
      )
    }
  },
  "MEMBER"
)

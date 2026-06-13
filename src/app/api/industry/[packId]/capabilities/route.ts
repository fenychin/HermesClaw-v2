import { getCachedManifest } from "@/lib/server/industry-pack-loader"
import { withRBAC } from "@/lib/server/api-handler"
import type { RouteContext } from "@/lib/server/api-handler"
import { logger } from "@/lib/logger"

export const GET = withRBAC<RouteContext<{ packId: string }>>(
  async (request, ctx, routeContext) => {
    let packId = "unknown"
    try {
      const params = await routeContext.params
      packId = params.packId
      const manifest = getCachedManifest(packId)
      
      const directory = manifest.directory || {
        workflows: [],
        skills: [],
        agents: [],
        connectors: [],
      }
      
      return Response.json({
        workflows: directory.workflows || [],
        skills: directory.skills || [],
        agents: directory.agents || [],
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

import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { getPackInstallation } from '@/lib/server/industry-pack-loader'
import type { WorkspaceContext } from '@/lib/workspace'

// GET /api/industry-packs/[packId]
// 获取指定 Industry Pack 的最新安装记录
export const GET = withRBAC(
  async (request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ packId: string }>) => {
    try {
      const { packId } = await routeCtx.params
      const result = await getPackInstallation(packId, ctx.workspaceId)

      if (!result) {
        return ApiResponse.error(`Pack ${packId} not found`, 404)
      }

      return ApiResponse.ok(result)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'ADMIN'
)

import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { getPackInstallation } from '@/lib/server/industry-pack-loader'
import type { WorkspaceContext } from '@/lib/workspace'

// GET /api/industry-packs/[packId]/[version]
// 获取指定 Industry Pack 特定版本的安装记录
export const GET = withRBAC(
  async (
    request: Request,
    ctx: WorkspaceContext,
    routeCtx: RouteContext<{ packId: string; version: string }>
  ) => {
    try {
      const { packId, version } = await routeCtx.params
      const result = await getPackInstallation(packId, ctx.workspaceId, version)

      if (!result) {
        return ApiResponse.error(`Pack ${packId}@${version} not found`, 404)
      }

      return ApiResponse.ok(result)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'ADMIN'
)

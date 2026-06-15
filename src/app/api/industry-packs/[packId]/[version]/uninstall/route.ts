import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { checkConfirmValue } from '@/lib/server/guardrail'
import {
  uninstallPack,
  PackInstallationNotFoundError
} from '@/lib/server/industry-pack-loader'
import type { WorkspaceContext } from '@/lib/workspace'

// POST /api/industry-packs/[packId]/[version]/uninstall
// 卸载指定版本的 Industry Pack
export const POST = withRBAC(
  async (
    request: Request,
    ctx: WorkspaceContext,
    routeCtx: RouteContext<{ packId: string; version: string }>
  ) => {
    try {
      const { packId, version } = await routeCtx.params
      
      let body: { confirm?: boolean; uninstalledBy?: string } = {}
      try {
        body = await request.json()
      } catch {
        // ignore body parse error, validation below will handle missing fields
      }

      const confirm = body.confirm
      const uninstalledBy = body.uninstalledBy || 'system'

      // 强制进行二次确认拦截
      const gate = await checkConfirmValue(confirm, '卸载行业包为高危变更，需要二次确认（confirm=true）')
      if (!gate.ok) {
        return gate.response
      }

      const result = await uninstallPack(packId, version, ctx.workspaceId, uninstalledBy)
      return ApiResponse.ok(result)
    } catch (error) {
      if (error instanceof PackInstallationNotFoundError) {
        return ApiResponse.error(error.message, 404)
      }
      const msg = error instanceof Error ? error.message : '卸载失败'
      return ApiResponse.error(msg, 500)
    }
  },
  'ADMIN'
)

import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { ApiResponse } from "@/lib/server/api-response"
import { rollbackPack, PackInstallationNotFoundError } from "@/lib/server/industry-pack-loader"
import { clearCache } from "@hermesclaw/industry-pack-sdk"
import type { WorkspaceContext } from "@/lib/workspace"

export const POST = withRBAC<RouteContext<{ packId: string }>>(
  async (req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ packId: string }>) => {
    const { packId } = await routeCtx.params

    let body: any = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const targetVersion: string | undefined = body.targetVersion || undefined
    const operatorId: string | undefined = body.operatorId || undefined

    // HIGH risk action — 需要确认令牌
    const INDUSTRY_ROLLBACK_TOKEN =
      process.env["INDUSTRY_PACK_ROLLBACK_TOKEN"] ?? "CONFIRM_INDUSTRY_ROLLBACK"
    const confirmationToken = body.confirmationToken || body.confirm || ""

    if (confirmationToken !== INDUSTRY_ROLLBACK_TOKEN) {
      return ApiResponse.error(
        "行业包回滚属高危操作，请携带正确的 confirmationToken。该操作将废弃当前版本能力并恢复上一版本。",
        409
      )
    }

    try {
      // 清除 SDK 缓存以读取目标版本的 manifest
      clearCache(packId)

      const result = await rollbackPack(
        packId,
        ctx.workspaceId,
        operatorId || ctx.userId || "system",
        targetVersion
      )

      return ApiResponse.ok({
        packId,
        rolledBackFrom: result.previousInstallation.packVersion,
        rolledBackTo: result.restoredInstallation.packVersion,
        previousStatus: result.previousInstallation.status,
        restoredStatus: result.restoredInstallation.status,
        rolledBackAt: new Date().toISOString(),
        message: `行业包 ${packId} 已从 v${result.previousInstallation.packVersion} 回滚到 v${result.restoredInstallation.packVersion}`
      })
    } catch (error) {
      if (error instanceof PackInstallationNotFoundError) {
        return ApiResponse.error(error.message, 404)
      }
      const msg = error instanceof Error ? error.message : "回滚失败"
      return ApiResponse.error(msg, 500)
    }
  },
  "ADMIN"
)

import { ApiResponse } from '@/lib/server/api-response'; import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { checkConfirmValue } from '@/lib/server/guardrail'; import { deactivatePack, PackInstallationNotFoundError } from '@/lib/server/industry-pack-loader'
import type { WorkspaceContext } from '@/lib/workspace'

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ packId: string }>) => {
  try {
    const { packId } = await routeCtx.params
    let body: any = {}; try { body = await request.json() } catch {}
    const gate = await checkConfirmValue(body.confirm, '停用暂停行业包为高危变更，需要二次确认')
    if (!gate.ok) return gate.response
    const result = await deactivatePack(packId, ctx.workspaceId, body.deactivatedBy || 'system')
    return ApiResponse.ok(result)
  } catch (error) { if (error instanceof PackInstallationNotFoundError) return ApiResponse.error(error.message, 404); return ApiResponse.error(error instanceof Error ? error.message : '停用失败', 500) }
}, 'ADMIN')

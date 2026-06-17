import { ApiResponse } from '@/lib/server/api-response'; import { withRBAC } from '@/lib/server/api-handler'
import { checkAutomationGate } from '@/lib/server/guardrail'
import { installPack, listInstalledPacks, PackAlreadyInstalledError, PackManifestInvalidError, PackDependencyNotMetError, PackCoreVersionIncompatibleError } from '@/lib/server/industry-pack-loader'
import { loadIndustryManifest } from '@hermesclaw/industry-pack-sdk'
import type { IndustryPackManifest } from '@hermesclaw/event-contracts'
import type { WorkspaceContext } from '@/lib/workspace'

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const { searchParams } = new URL(request.url)
    const result = await listInstalledPacks(ctx.workspaceId, { targetIndustry: searchParams.get('targetIndustry') || undefined, status: searchParams.get('status') || undefined, page: parseInt(searchParams.get('page') || '1', 10), pageSize: parseInt(searchParams.get('pageSize') || '10', 10) })
    return ApiResponse.ok(result)
  } catch (error) { return ApiResponse.error(error instanceof Error ? error.message : '未知错误', 500) }
}, 'VIEWER')

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const body = await request.json(); const packId = body.packId || body.id
    if (!packId) return ApiResponse.error('缺少 packId', 400)
    const gate = await checkAutomationGate({ automationLevel: "L3", riskLevel: "medium", confirmed: body.confirm === true, actionName: `安装行业包: ${packId}` })
    if (!gate.ok) return gate.response
    // SDK 加载并校验 manifest，再交给 loader 写库
    const manifest = loadIndustryManifest(packId) as unknown as IndustryPackManifest
    const result = await installPack(manifest, ctx.workspaceId, ctx.userId || "system")
    return ApiResponse.ok(result)
  } catch (error) {
    if (error instanceof PackAlreadyInstalledError) return ApiResponse.error(error.message, 409)
    if (error instanceof PackManifestInvalidError) return ApiResponse.error(error.message, 400)
    if (error instanceof PackDependencyNotMetError || error instanceof PackCoreVersionIncompatibleError) return ApiResponse.error(error.message, 400)
    return ApiResponse.error(error instanceof Error ? error.message : '未知错误', 500)
  }
}, 'ADMIN')

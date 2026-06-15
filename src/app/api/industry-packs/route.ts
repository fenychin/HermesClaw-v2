import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { checkAutomationGate } from '@/lib/server/guardrail'
import {
  installPack,
  listInstalledPacks,
  PackAlreadyInstalledError,
  PackManifestInvalidError,
  PackDependencyNotMetError,
  PackCoreVersionIncompatibleError
} from '@/lib/server/industry-pack-loader'
import type { WorkspaceContext } from '@/lib/workspace'

// GET /api/industry-packs
// 查询已安装的 Industry Packs 列表
export const GET = withRBAC(
  async (request: Request, ctx: WorkspaceContext) => {
    try {
      const { searchParams } = new URL(request.url)
      const targetIndustry = searchParams.get('targetIndustry') || undefined
      const status = searchParams.get('status') || undefined
      const page = parseInt(searchParams.get('page') || '1', 10)
      const pageSize = parseInt(searchParams.get('pageSize') || '10', 10)

      const result = await listInstalledPacks(ctx.workspaceId, {
        targetIndustry,
        status,
        page,
        pageSize
      })

      return ApiResponse.ok(result)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'ADMIN'
)

// POST /api/industry-packs
// 安装 Industry Pack
export const POST = withRBAC(
  async (request: Request, ctx: WorkspaceContext) => {
    try {
      const body = await request.json()
      const manifest = body.manifest
      const confirm = body.confirm
      const installedBy = body.installedBy || 'system'

      if (!manifest) {
        return ApiResponse.error('manifest is required', 400)
      }

      // 如果能力条目 capabilities.length > 10，判定为高危批量安装，需要 L3 二次确认
      if (Array.isArray(manifest.capabilities) && manifest.capabilities.length > 10) {
        const gate = await checkAutomationGate({
          automationLevel: 'L3',
          riskLevel: 'high',
          confirmed: confirm === true,
          actionName: '安装大型行业包'
        })
        if (!gate.ok) {
          return gate.response
        }
      }

      const result = await installPack(manifest, ctx.workspaceId, installedBy)
      return ApiResponse.ok(result)
    } catch (error) {
      if (error instanceof PackAlreadyInstalledError) {
        return ApiResponse.error(error.message, 409)
      }
      if (
        error instanceof PackManifestInvalidError ||
        error instanceof PackDependencyNotMetError ||
        error instanceof PackCoreVersionIncompatibleError
      ) {
        return ApiResponse.error(error.message, 400)
      }
      const msg = error instanceof Error ? error.message : '安装失败'
      return ApiResponse.error(msg, 500)
    }
  },
  'ADMIN'
)

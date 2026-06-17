import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { deprecateCapability, CapabilityNotFoundError } from '@/lib/server/capability-registry'
import type { WorkspaceContext } from '@/lib/workspace'
import { z } from 'zod'

const DeprecateSchema = z.object({
  reason: z.string().min(1, '必须提供弃用原因'),
  deprecatedBy: z.string().optional()
})

// POST /api/capabilities/[id]/[version]/deprecate
// 废弃指定版本的能力
export const POST = withRBAC(
  async (request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string; version: string }>) => {
    try {
      const { id, version } = await routeCtx.params
      const body = await request.json()
      
      const parsed = DeprecateSchema.safeParse(body)
      if (!parsed.success) {
        return ApiResponse.error('请求参数校验失败: ' + parsed.error.message, 400)
      }

      const deprecatedBy = parsed.data.deprecatedBy || ctx.userId || 'system'
      const registration = await deprecateCapability(id, version, parsed.data.reason, deprecatedBy)

      return ApiResponse.ok(registration)
    } catch (error) {
      if (error instanceof CapabilityNotFoundError) {
        return ApiResponse.error(error.message, 404)
      }
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'MEMBER'
)

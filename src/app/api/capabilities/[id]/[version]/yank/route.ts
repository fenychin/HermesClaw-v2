import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { yankCapability, CapabilityNotFoundError } from '@/lib/server/capability-registry'
import { checkConfirmValue } from '@/lib/server/guardrail'
import type { WorkspaceContext } from '@/lib/workspace'
import { z } from 'zod'

const YankSchema = z.object({
  reason: z.string().min(1, '必须提供下线原因'),
  yankedBy: z.string().optional(),
  confirm: z.boolean()
})

// POST /api/capabilities/[id]/[version]/yank
// 紧急下线指定版本的能力
export const POST = withRBAC(
  async (request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string; version: string }>) => {
    try {
      const { id, version } = await routeCtx.params
      const body = await request.json()

      const parsed = YankSchema.safeParse(body)
      if (!parsed.success) {
        return ApiResponse.error('请求参数校验失败: ' + parsed.error.message, 400)
      }

      // 高危操作防线：使用 guardrail 的 checkConfirmValue 校验二次确认 (confirm === true)
      const confirmResult = await checkConfirmValue(
        parsed.data.confirm,
        '紧急下线能力属于高危变更，需要显式进行二次确认'
      )
      if (!confirmResult.ok) {
        return confirmResult.response
      }

      const yankedBy = parsed.data.yankedBy || ctx.userId || 'system'
      const registration = await yankCapability(id, version, parsed.data.reason, yankedBy)

      return ApiResponse.ok(registration)
    } catch (error) {
      if (error instanceof CapabilityNotFoundError) {
        return ApiResponse.error(error.message, 404)
      }
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'ADMIN'
)

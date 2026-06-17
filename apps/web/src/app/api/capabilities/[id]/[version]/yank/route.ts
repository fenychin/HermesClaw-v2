import { ApiResponse } from '@/lib/server/api-response'; import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { yankCapability, CapabilityNotFoundError } from '@/lib/server/capability-registry'
import { checkConfirmValue } from '@/lib/server/guardrail'; import type { WorkspaceContext } from '@/lib/workspace'
import { z } from 'zod'

const YankSchema = z.object({ reason: z.string().min(1), yankedBy: z.string().optional(), confirm: z.boolean() })

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string; version: string }>) => {
  try {
    const { id, version } = await routeCtx.params; const body = await request.json()
    const parsed = YankSchema.safeParse(body); if (!parsed.success) return ApiResponse.error('参数校验失败: ' + parsed.error.message, 400)
    const confirmResult = await checkConfirmValue(parsed.data.confirm, '紧急下线属于高危变更，需要二次确认')
    if (!confirmResult.ok) return confirmResult.response
    const registration = await yankCapability(id, version, parsed.data.reason, parsed.data.yankedBy || ctx.userId || 'system')
    return ApiResponse.ok(registration)
  } catch (error) { if (error instanceof CapabilityNotFoundError) return ApiResponse.error(error.message, 404); return ApiResponse.error(error instanceof Error ? error.message : '未知错误', 500) }
}, 'ADMIN')

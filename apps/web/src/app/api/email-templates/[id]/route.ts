import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { checkConfirmQuery } from '@/lib/server/guardrail'
import type { WorkspaceContext } from '@/lib/workspace'
import { z } from 'zod'
import { getTemplate, patchTemplate, archiveTemplate, EmailTemplateError } from "@/lib/server/email-template-service"

const UpdateTemplateSchema = z.object({ name: z.string().optional(), subject: z.string().optional(), bodyHtml: z.string().optional(), bodyText: z.string().optional(), variables: z.array(z.string()).optional(), category: z.enum(['transactional', 'marketing', 'notification', 'alert']).optional() })

function handleErr(e: unknown) { if (e instanceof EmailTemplateError) return ApiResponse.error(e.message, e.httpStatus); return ApiResponse.error(e instanceof Error ? e.message : '未知错误', 500) }

export const GET = withRBAC(async (_request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
  try { const { id } = await routeCtx.params; return ApiResponse.ok(await getTemplate(id, ctx.workspaceId)) } catch (e) { return handleErr(e) }
}, 'VIEWER')

export const PATCH = withRBAC(async (request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
  try {
    const { id } = await routeCtx.params; const parsed = UpdateTemplateSchema.safeParse(await request.json())
    if (!parsed.success) return ApiResponse.error('请求参数校验失败: ' + parsed.error.message, 400)
    return ApiResponse.ok(await patchTemplate(id, ctx.workspaceId, parsed.data))
  } catch (e) { return handleErr(e) }
}, 'MEMBER')

export const DELETE = withRBAC(async (request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
  try {
    const { id } = await routeCtx.params
    const guard = await checkConfirmQuery(request, '归档邮件模板属于高危操作，需要二次确认'); if (!guard.ok) return guard.response
    return ApiResponse.ok(await archiveTemplate(id, ctx.workspaceId))
  } catch (e) { return handleErr(e) }
}, 'MEMBER')

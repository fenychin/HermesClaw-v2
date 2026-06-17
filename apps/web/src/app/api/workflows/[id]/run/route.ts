import { ApiResponse } from '@/lib/server/api-response'; import { logger } from '@/lib/logger'; import { rateLimit } from '@/lib/rate-limit'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { validateBody, WorkflowRunSchema } from '@/lib/server/validators'
import type { WorkspaceContext } from '@/lib/workspace'
import { WorkflowSchedulerService } from '@/lib/server/workflow/scheduler'
export const runtime = 'nodejs'; export const maxDuration = 60

export const POST = withRBAC(async (req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
  const { id } = await routeCtx.params
  const ip = req.headers.get('x-forwarded-for') || 'unknown'
  if (!rateLimit(ip, 10, 60_000)) return ApiResponse.error('请求过于频繁', 429)
  let rawBody: unknown = {}; try { const text = await req.text(); if (text?.trim()) rawBody = JSON.parse(text) } catch { return ApiResponse.error('请求体 JSON 解析失败', 400) }
  const parsed = validateBody(rawBody, WorkflowRunSchema); if (parsed instanceof Response) return parsed
  const result = await WorkflowSchedulerService.runWorkflow({ workflowId: id, inputs: parsed.input, workspaceId: ctx.workspaceId })
  return ApiResponse.ok({ runId: result.runId, status: result.status, output: result.output })
}, 'MEMBER')

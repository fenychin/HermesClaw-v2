/**
 * POST /api/workflows/[id]/run —— 执行指定工作流
 *
 * 流程：
 *   1. RBAC 门禁（MEMBER 以上）
 *   2. 频率限制（IP 级，防止滥用）
 *   3. 校验必填参数（id 来自路径，input 来自请求体）
 *   4. 调用统一的工作空间级别工作流调度器 WorkflowSchedulerService
 *   5. 成功返回 { runId, status, output }；失败按错误类型返回相应状态码
 *
 * 请求体（可选）：{ input?: Record<string, unknown> }
 * 响应体：ApiResponse<{ runId: string; status: string; output: unknown }>
 */
import { ApiResponse } from '@/lib/server/shared/api-response'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { withRBAC, type RouteContext } from '@/lib/server/shared/api-handler'
import { validateBody, WorkflowRunSchema } from '@/lib/validators'
import type { WorkspaceContext } from '@/lib/workspace'
import { WorkflowSchedulerService } from '@/lib/server/workflow/scheduler'

export const runtime = 'nodejs'
export const maxDuration = 60

export const POST = withRBAC(
  async (req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
    const { id } = await routeCtx.params

    // 频率限制：每个 IP 每分钟最多 10 次工作流执行
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    if (!rateLimit(ip, 10, 60_000)) {
      return ApiResponse.error('请求过于频繁，请稍后重试', 429)
    }

    // zod schema 校验请求体（空 body 容错仍保留）
    let rawBody: unknown = {}
    try {
      const text = await req.text()
      if (text && text.trim().length > 0) {
        rawBody = JSON.parse(text)
      }
    } catch {
      return ApiResponse.error('请求体 JSON 解析失败', 400)
    }

    const parsed = validateBody(rawBody, WorkflowRunSchema)
    if (parsed instanceof Response) return parsed

    const input = parsed.input

    logger.info('POST /api/workflows/[id]/run', { workflowId: id, userId: ctx.userId })

    const result = await WorkflowSchedulerService.runWorkflow({
      workflowId: id,
      inputs: input,
      workspaceId: ctx.workspaceId,
    })

    return ApiResponse.ok({
      runId: result.runId,
      status: result.status,
      output: result.output,
    })
  },
  'MEMBER',
)



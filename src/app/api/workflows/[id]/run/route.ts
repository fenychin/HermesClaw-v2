/**
 * POST /api/workflows/[id]/run —— 执行指定工作流
 *
 * 流程：
 *   1. RBAC 门禁（MEMBER 以上）
 *   2. 频率限制（IP 级，防止滥用）
 *   3. 校验必填参数（id 来自路径，input 来自请求体）
 *   4. 调用 dag-runner → runWorkflow(workflowId, input)
 *   5. 成功返回 { runId, status, output }；失败按错误类型返回相应状态码
 *
 * 请求体（可选）：{ input?: Record<string, unknown> }
 * 响应体：ApiResponse<{ runId: string; status: string; output: unknown }>
 */
import { ApiResponse } from '@/lib/server/api-response'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import {
  runWorkflow,
  WorkflowNotFoundError,
  MaxDepthExceededError,
} from '@/lib/server/workflow/dag-runner'
import type { WorkspaceContext } from '@/lib/workspace'

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

    try {
      // 解析请求体（容错空 body）
      let body: Record<string, unknown> = {}
      try {
        const text = await req.text()
        if (text && text.trim().length > 0) {
          body = JSON.parse(text)
        }
      } catch {
        return ApiResponse.error('请求体 JSON 解析失败', 400)
      }

      const input = (body.input as Record<string, unknown>) ?? body

      logger.info('POST /api/workflows/[id]/run', { workflowId: id, userId: ctx.userId })

      const result = await runWorkflow(id, Object.keys(input).length > 0 ? input : undefined)

      return ApiResponse.ok({
        runId: result.runId,
        status: result.status,
        output: result.output,
      })
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        return ApiResponse.error(error.message, 404)
      }
      if (error instanceof MaxDepthExceededError) {
        return ApiResponse.error(error.message, 400)
      }

      const message = error instanceof Error ? error.message : '未知错误'
      logger.error('POST /api/workflows/[id]/run 执行失败', {
        workflowId: id,
        error: message,
      })
      return ApiResponse.error(`工作流执行失败：${message}`, 500)
    }
  },
  'MEMBER',
)

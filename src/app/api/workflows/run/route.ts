import { z } from 'zod'
import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { validateBody } from '@/lib/validators'
import { logger } from '@/lib/logger'
import type { WorkspaceContext } from '@/lib/workspace'
import { WorkflowSchedulerService } from '@/lib/server/workflow/scheduler'
import { WorkflowNotFoundError, MaxDepthExceededError } from '@/lib/server/workflow/dag-runner'

/** 工作流执行请求 Schema（对应 HermesRunWorkflowRequest） */
const WorkflowRunSchema = z.object({
  workflowId: z.string().min(1).max(100),
  inputs: z.record(z.string(), z.unknown()),
  projectId: z.string().max(100).optional(),
  agentId: z.string().max(100).optional(),
})

// POST /api/workflows/run
// 执行工作流，通过统一的 WorkflowSchedulerService 调度路由（写操作，需 MEMBER 以上角色）
export const POST = withRBAC(async (req: Request, ctx: WorkspaceContext) => {
  try {
    // 参数校验
    const rawBody = await req.json()
    const parsed = validateBody(rawBody, WorkflowRunSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    // 通过统一调度服务执行
    const result = await WorkflowSchedulerService.runWorkflow({
      workflowId: body.workflowId,
      inputs: body.inputs,
      workspaceId: ctx.workspaceId,
      projectId: body.projectId,
      agentId: body.agentId,
    })

    return ApiResponse.ok(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    
    // 异常类型精细化映射
    let statusCode = 500
    if (message.includes('[Hermes API 错误]') || (error instanceof DOMException && error.name === 'TimeoutError')) {
      statusCode = 502
    } else if (message.includes('任务输入不符合') || error instanceof MaxDepthExceededError) {
      statusCode = 400
    } else if (error instanceof WorkflowNotFoundError) {
      statusCode = 404
    }

    logger.error('POST /api/workflows/run: 失败', {
      error: message,
      statusCode,
    })

    return ApiResponse.error(message, statusCode)
  }
}, "MEMBER")


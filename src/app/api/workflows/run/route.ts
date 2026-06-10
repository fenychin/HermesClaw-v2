import { z } from 'zod'
import { hermesClient } from '@/lib/server/adapters/hermes'
import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { validateBody } from '@/lib/validators'
import { writeAuditLog, actorFromSession } from '@/lib/server/audit'
import { logger } from '@/lib/logger'
import type { WorkspaceContext } from '@/lib/workspace'

/** 工作流执行请求 Schema（对应 HermesRunWorkflowRequest） */
const WorkflowRunSchema = z.object({
  workflowId: z.string().min(1).max(100),
  inputs: z.record(z.string(), z.unknown()),
  projectId: z.string().max(100).optional(),
  agentId: z.string().max(100).optional(),
})

// POST /api/workflows/run
// 执行工作流，通过 Hermes Adapter 路由（写操作，需 MEMBER 以上角色）
export const POST = withRBAC(async (req: Request, ctx: WorkspaceContext) => {
  try {
    // 参数校验（替换原裸 if 判断，统一走 zod）
    const rawBody = await req.json()
    const parsed = validateBody(rawBody, WorkflowRunSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const result = await hermesClient.runWorkflow(body)

    // 无日志禁止静默执行（AGENTS.md §5 #3 / §4.4 闭环反馈）：留一条审计轨迹
    await writeAuditLog({
      actor: await actorFromSession(),
      action: 'workflow.run',
      targetType: 'workflow',
      targetId: body.workflowId,
      detail: `执行工作流 ${body.workflowId}`,
      riskLevel: 'mid',
      workspaceId: ctx.workspaceId,
    })

    return ApiResponse.ok(result)
  } catch (error) {
    logger.error('POST /api/workflows/run: 失败', {
      error: error instanceof Error ? error.message : '未知错误',
    })
    const message = error instanceof Error ? error.message : '未知错误'
    return ApiResponse.error(message, 500)
  }
}, "MEMBER")

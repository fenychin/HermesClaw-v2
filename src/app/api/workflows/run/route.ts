import { z } from 'zod'
import { hermesClient } from '@/lib/server/adapters/hermes'
import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { validateBody } from '@/lib/validators'
import { writeAuditLog, actorFromSession } from '@/lib/server/audit'
import { writeAgentLog } from '@/lib/server/agent-log'
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
  // 在 try 外层声明，确保 catch 块可访问（用于失败审计）
  let body: z.infer<typeof WorkflowRunSchema> | null = null

  try {
    // 参数校验（替换原裸 if 判断，统一走 zod）
    const rawBody = await req.json()
    const parsed = validateBody(rawBody, WorkflowRunSchema)
    if (parsed instanceof Response) return parsed
    body = parsed

    const result = await hermesClient.runWorkflow(body)

    // 无日志禁止静默执行（AGENTS.md §5 #3 / §4.4 闭环反馈）：留一条审计轨迹
    const actor = await actorFromSession()
    await writeAuditLog({
      actor,
      action: 'workflow.run',
      targetType: 'workflow',
      targetId: body.workflowId,
      detail: `执行工作流 ${body.workflowId}`,
      riskLevel: 'medium',
      workspaceId: ctx.workspaceId,
    })

    // 写入 AgentLog，确保闭环反馈（AGENTS.md §2.3：每个节点 start/finish 至少一条 AgentLog(source='workflow')）
    await writeAgentLog({
      agentId: body.agentId ?? null,
      source: 'workflow',
      taskName: `执行工作流 ${body.workflowId}`,
      status: 'success',
      duration: '0s',
      detail: `通过 Hermes 适配器执行工作流 ${body.workflowId}`,
      riskLevel: 'medium',
    })

    return ApiResponse.ok(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    // 区分错误类型：Hermes API 错误 / 网络超时 → 502；其他 → 500
    const isHermesError = message.includes('[Hermes API 错误]')
    const isTimeout = error instanceof DOMException && error.name === 'TimeoutError'
    const statusCode = isHermesError || isTimeout ? 502 : 500

    logger.error('POST /api/workflows/run: 失败', {
      error: message,
      statusCode,
      isHermesError,
      isTimeout,
    })

    // 无日志禁止静默执行（AGENTS.md §5 #3）：失败也须留审计轨迹
    try {
      const actor = await actorFromSession()
      await writeAuditLog({
        actor,
        action: 'workflow.run.fail',
        targetType: 'workflow',
        targetId: body?.workflowId ?? 'unknown',
        detail: `工作流执行失败（${statusCode}）：${message.slice(0, 200)}`,
        riskLevel: 'high',
        workspaceId: ctx.workspaceId,
      })
      await writeAgentLog({
        agentId: body?.agentId ?? null,
        source: 'workflow',
        taskName: `执行工作流 ${body?.workflowId ?? 'unknown'}`,
        status: 'failed',
        duration: '0s',
        detail: `Hermes 适配器调用失败（${statusCode}）：${message.slice(0, 200)}`,
        riskLevel: 'high',
      })
    } catch (auditError) {
      // 审计写入失败不阻断主流程，但需记录告警
      logger.error('POST /api/workflows/run: 审计写入失败', {
        error: auditError instanceof Error ? auditError.message : '未知',
      })
    }

    return ApiResponse.error(message, statusCode)
  }
}, "MEMBER")

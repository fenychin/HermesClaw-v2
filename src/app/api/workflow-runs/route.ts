import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { startWorkflowRun, executeWorkflowRun } from '@/lib/server/workflow/runtime-engine'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { parseIntentToTaskEnvelope } from '@/lib/server/intent-service'
import { validateTaskAutomationLevel } from '@/lib/server/guardrail'
import { writeAuditLog } from '@/lib/server/audit'
import crypto from 'crypto'

// 10 分钟内存防重缓存（用于相同 idempotencyKey 的快速去重，保障强一致性）
const idempotencyMap = new Map<string, {
  workflowRunId?: string;
  checkpointId?: string;
  status: 'running' | 'pending_approval';
  timestamp: number;
}>();

export const POST = withRBAC(
  async (req: Request, ctx: any) => {
    let body: any = {}
    try {
      const text = await req.text()
      if (text) {
        body = JSON.parse(text)
      }
    } catch {
      // ignore
    }

    const { agentId, input, idempotencyKey } = body
    if (!agentId) {
      return ApiResponse.apiError('Missing agentId in body', 400, 'BAD_REQUEST')
    }
    if (!input) {
      return ApiResponse.apiError('Missing input in body', 400, 'BAD_REQUEST')
    }

    // 1. 幂等去重（清理过期缓存，并查重）
    for (const [key, val] of idempotencyMap.entries()) {
      if (Date.now() - val.timestamp > 10 * 60 * 1000) {
        idempotencyMap.delete(key);
      }
    }

    if (idempotencyKey) {
      const cached = idempotencyMap.get(idempotencyKey);
      if (cached) {
        if (cached.status === 'pending_approval') {
          return ApiResponse.ok({
            status: 'pending_approval',
            checkpointId: cached.checkpointId
          });
        } else {
          return ApiResponse.ok({
            workflowRunId: cached.workflowRunId,
            status: 'running'
          });
        }
      }
    }

    try {
      // 2. 查找 Agent 实体，以获取 context 参数
      const agent = await prisma.agent.findUnique({
        where: { id: agentId }
      })
      if (!agent) {
        return ApiResponse.apiError('Agent not found', 404, 'NOT_FOUND')
      }

      if (agent.status === 'rolled-back') {
        return ApiResponse.apiError('Agent 不可用 (rolled-back)', 409, 'AGENT_ROLLED_BACK')
      }

      // 3. 风险等级自动判定逻辑 (L3 Agent 下发写操作或包含高危词即 high)
      let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
      const inputLower = input.toLowerCase()
      const hasHighRiskWords = inputLower.includes('发送') || inputLower.includes('发信') || 
                               inputLower.includes('邮件') || inputLower.includes('email') || 
                               inputLower.includes('删除') || inputLower.includes('delete') || 
                               inputLower.includes('修改') || inputLower.includes('更新') || 
                               inputLower.includes('update') || inputLower.includes('高危') || 
                               inputLower.includes('high')

      if (agent.automationLevel === 'L3') {
        riskLevel = hasHighRiskWords ? 'high' : 'medium'
      } else if (agent.automationLevel === 'L4') {
        riskLevel = 'critical'
      } else {
        riskLevel = hasHighRiskWords ? 'high' : 'low'
      }

      // 4. 调用 parseIntentToTaskEnvelope 意图解析
      const context = {
        workspaceId: ctx.workspaceId,
        agentId,
        industryId: agent.industryId || 'default',
        automationLevel: (agent.automationLevel as any) || 'L2',
        riskLevel
      }
      const envelope = await parseIntentToTaskEnvelope(input, context)

      // 5. 校验安全护栏
      try {
        await validateTaskAutomationLevel(envelope, ctx.userId || 'system')
      } catch (err: any) {
        if (err.name === 'GuardrailViolationError' || err.message?.includes('安全护栏拦截')) {
          // 被拦截，系统会自动在 validateTaskAutomationLevel 内部创建 ApprovalCheckpoint
          // 查找该运行所对应的 pending checkpoint
          const checkpoint = await prisma.approvalCheckpoint.findFirst({
            where: {
              workflowRunId: envelope.workflowRunId,
              decision: 'pending'
            },
            orderBy: {
              createdAt: 'desc'
            }
          })
          const checkpointId = checkpoint?.id || `acp-${envelope.workflowRunId}`

          // 兜底手动建一个审批点以防万一
          if (!checkpoint) {
            try {
              const { createApprovalCheckpoint } = await import('@/lib/server/approval')
              await createApprovalCheckpoint({
                taskId: envelope.taskId,
                workflowRunId: envelope.workflowRunId,
                workspaceId: envelope.workspaceId,
                triggerReason: 'risk.level.high',
                riskLevel: envelope.riskLevel,
                automationLevel: envelope.automationLevel ?? 'L3',
                actionSummary: `高危动作被护栏拦截，等待人工审批：${envelope.actionType}`,
                inputSnapshot: envelope.input ?? {},
                policySnapshotVersion: envelope.policySnapshotVersion ?? '1.0.0',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                creator: ctx.userId || 'system',
              })
            } catch (createErr) {
              console.error("Failed to create fallback approval checkpoint:", createErr)
            }
          }

          if (idempotencyKey) {
            idempotencyMap.set(idempotencyKey, {
              checkpointId,
              status: 'pending_approval',
              timestamp: Date.now()
            })
          }

          return ApiResponse.ok({
            status: 'pending_approval',
            checkpointId
          })
        }
        throw err
      }

      // 6. 优先级获取 / 兜底创建 Workflow，以便 startWorkflowRun 启动
      let workflow = await prisma.workflow.findFirst({
        where: {
          workspaceId: ctx.workspaceId,
          name: { contains: agent.name }
        }
      })

      if (!workflow && agent.industryId) {
        workflow = await prisma.workflow.findFirst({
          where: {
            workspaceId: ctx.workspaceId,
            industryId: agent.industryId
          }
        })
      }

      if (!workflow) {
        workflow = await prisma.workflow.findFirst({
          where: {
            workspaceId: ctx.workspaceId
          }
        })
      }

      if (!workflow) {
        const workflowId = `wf-auto-${crypto.randomUUID()}`
        workflow = await prisma.workflow.create({
          data: {
            id: workflowId,
            workspaceId: ctx.workspaceId,
            name: `${agent.name} 任务流`,
            nodes: JSON.stringify([
              { id: "node-1", kind: "skill-call", config: { capabilityId: "skill-followup", nodeType: "skill-call" } },
              { id: "node-2", kind: "connector-call", config: { capabilityId: "connector-email", nodeType: "connector-call" } }
            ]),
            edges: JSON.stringify([
              { from: "node-1", to: "node-2" }
            ]),
            status: "active",
            industryId: agent.industryId
          }
        })
      }

      // 7. 创建并启动工作流运行（status=running）
      const run = await startWorkflowRun({
        workflowId: workflow.id,
        workspaceId: ctx.workspaceId,
        inputContext: {
          ...envelope.input,
          idempotencyKey // 保存幂等键到 inputContext 以便兜底
        },
        triggeredBy: ctx.userId || 'system',
        agentId: agent.id,
        triggerType: 'agent-dispatch'
      })

      // 8. 异步触发 executeWorkflowRun 异步执行不阻塞
      executeWorkflowRun(run.runId, ctx.workspaceId).catch((runErr) => {
        logger.error(`[POST /api/workflow-runs] Async execution failed for runId ${run.runId}:`, runErr)
      })

      // 9. 写入 AuditLog 记录 task.dispatch 动作
      await writeAuditLog({
        actor: ctx.userId || 'system',
        action: 'task.dispatch',
        targetType: 'workflowRun',
        targetId: run.id,
        detail: `下发 Agent 任务成功，启动工作流运行: "${input}"`,
        riskLevel: 'low',
        workspaceId: ctx.workspaceId
      })

      // 10. 保存进防重缓存
      if (idempotencyKey) {
        idempotencyMap.set(idempotencyKey, {
          workflowRunId: run.runId,
          status: 'running',
          timestamp: Date.now()
        })
      }

      return ApiResponse.ok({
        workflowRunId: run.runId,
        status: 'running'
      })
    } catch (err: any) {
      logger.error('POST /api/workflow-runs: failed', {
        service: 'api-workflow-runs',
        action: 'workflow.run.create.failed',
        workspaceId: ctx.workspaceId,
        errorCode: 'WORKFLOW_START_FAILED',
        errorMessage: err instanceof Error ? err.message : String(err)
      })
      return ApiResponse.apiError(err.message, 400, 'WORKFLOW_START_FAILED')
    }
  },
  'MEMBER'
)

export const GET = withRBAC(
  async (req: Request, ctx: any) => {
    try {
      const { searchParams } = new URL(req.url)
      const workflowId = searchParams.get('workflowId')
      const agentId = searchParams.get('agentId')
      const limitStr = searchParams.get('limit')
      const limit = limitStr ? parseInt(limitStr, 10) : undefined

      const whereClause: any = {
        workspaceId: ctx.workspaceId
      }
      if (workflowId) {
        whereClause.workflowId = workflowId
      }
      if (agentId) {
        whereClause.agentId = agentId
      }

      const runs = await prisma.workflowRun.findMany({
        where: whereClause,
        orderBy: {
          createdAt: 'desc'
        },
        take: limit
      })

      return ApiResponse.ok(runs)
    } catch (err: any) {
      logger.error('GET /api/workflow-runs: failed', {
        service: 'api-workflow-runs',
        action: 'workflow.run.list.failed',
        workspaceId: ctx.workspaceId,
        errorCode: 'WORKFLOW_LIST_FAILED',
        errorMessage: err instanceof Error ? err.message : String(err)
      })
      return ApiResponse.apiError(err.message, 500, 'WORKFLOW_LIST_FAILED')
    }
  },
  'MEMBER'
)


/**
 * Workflow Run Service — 工作流运行启动逻辑
 *
 * 从 apps/web/src/app/api/workflow-runs/route.ts 下沉。
 */
import { prisma } from "@/lib/prisma"
import { dispatchEnvelope } from "@/lib/server/workflow/runtime-engine"
import { parseIntentToTaskEnvelope } from "@/lib/server/intent-service"
import { validateTaskAutomationLevel } from "@/lib/server/guardrail"
import { createApprovalCheckpoint } from "@/lib/server/approval"
import crypto from "crypto"

const idempotencyMap = new Map<string, { workflowRunId?: string; checkpointId?: string; status: 'running' | 'pending_approval'; timestamp: number }>()

export class StartWorkflowRunError extends Error {
  constructor(public readonly httpStatus: number, message: string, public readonly code?: string) { super(message); this.name = "StartWorkflowRunError" }
}

export async function startAgentWorkflowRun(opts: { agentId: string; input: any; idempotencyKey?: string; workspaceId: string; userId?: string }) {
  for (const [key, val] of idempotencyMap.entries()) if (Date.now() - val.timestamp > 600000) idempotencyMap.delete(key)
  if (opts.idempotencyKey) {
    const cached = idempotencyMap.get(opts.idempotencyKey)
    if (cached) return { status: cached.status, ...(cached.status === 'pending_approval' ? { checkpointId: cached.checkpointId } : { workflowRunId: cached.workflowRunId }) }
  }
  const agent = await prisma.agent.findUnique({ where: { id: opts.agentId } })
  if (!agent) throw new StartWorkflowRunError(404, "Agent not found", "NOT_FOUND")
  if (agent.status === 'rolled-back') throw new StartWorkflowRunError(409, "Agent 不可用 (rolled-back)", "AGENT_ROLLED_BACK")

  const hasHighRisk = /发送|发信|邮件|email|删除|delete|修改|更新|update|高危|high/i.test(opts.input)
  let riskLevel: any = agent.automationLevel === 'L4' ? 'critical' : agent.automationLevel === 'L3' ? (hasHighRisk ? 'high' : 'medium') : (hasHighRisk ? 'high' : 'low')
  const automationLevel = (agent.automationLevel || 'L2') as 'L1' | 'L2' | 'L3' | 'L4'
  const envelope = await parseIntentToTaskEnvelope(opts.input, { workspaceId: opts.workspaceId, agentId: opts.agentId, industryId: agent.industryId || 'default', automationLevel, riskLevel })

  try { await validateTaskAutomationLevel(envelope, opts.userId || 'system') }
  catch (err: any) {
    if (err.name === 'GuardrailViolationError' || err.message?.includes('安全护栏拦截')) {
      const checkpoint = await prisma.approvalCheckpoint.findFirst({ where: { workflowRunId: envelope.workflowRunId, decision: 'pending' }, orderBy: { createdAt: 'desc' } })
      const checkpointId = checkpoint?.id || `acp-${envelope.workflowRunId}`
      if (!checkpoint) try { await createApprovalCheckpoint({ taskId: envelope.taskId, workflowRunId: envelope.workflowRunId, workspaceId: envelope.workspaceId, triggerReason: 'risk.level.high', riskLevel: envelope.riskLevel, automationLevel: envelope.automationLevel ?? 'L3', actionSummary: `高危动作等待审批：${envelope.actionType}`, inputSnapshot: envelope.input ?? {}, policySnapshotVersion: envelope.policySnapshotVersion ?? '1.0.0', expiresAt: new Date(Date.now() + 86400000), creator: opts.userId || 'system' }) } catch {}
      if (opts.idempotencyKey) idempotencyMap.set(opts.idempotencyKey, { checkpointId, status: 'pending_approval', timestamp: Date.now() })
      return { status: 'pending_approval', checkpointId }
    }
    throw err
  }

  let workflow = await prisma.workflow.findFirst({ where: { workspaceId: opts.workspaceId, name: { contains: agent.name } } })
  if (!workflow && agent.industryId) workflow = await prisma.workflow.findFirst({ where: { workspaceId: opts.workspaceId, industryId: agent.industryId } })
  if (!workflow) workflow = await prisma.workflow.findFirst({ where: { workspaceId: opts.workspaceId } })
  if (!workflow) workflow = await prisma.workflow.create({ data: { id: `wf-auto-${crypto.randomUUID()}`, workspaceId: opts.workspaceId, name: agent.name || 'Auto', status: 'active', nodes: '[]', edges: '[]' } })

  const { run } = await dispatchEnvelope(
    {
      envelope,
      workflowId: workflow.id,
      workspaceId: opts.workspaceId,
      agentId: opts.agentId,
      triggeredBy: opts.userId,
    },
  )
  if (opts.idempotencyKey) idempotencyMap.set(opts.idempotencyKey, { workflowRunId: run.id, status: 'running', timestamp: Date.now() })
  return { workflowRunId: run.id, status: 'running' }
}

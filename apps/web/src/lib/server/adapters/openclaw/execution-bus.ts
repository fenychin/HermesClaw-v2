/**
 * ⚠️ DEPRECATED — 兼容层，已迁移至 @hermesclaw/openclaw-adapter
 *
 * - subscribeExecutionEvents / emitBusEvent 现 re-export 自 @hermesclaw/openclaw-adapter
 * - dispatchTaskEnvelope 暂留（含 HTTP connector + audit 域逻辑），将于 2026-07-01 前迁移至 createOpenClawAdapter().dispatch()
 */

import crypto from 'crypto'
import { ExecutionEventSchema, type ExecutionEvent, TaskEnvelopeSchema, type TaskEnvelope } from '@hermesclaw/event-contracts'
import { executeHttpConnector } from '@/lib/server/connectors/http-connector'
import { validateTaskAutomationLevel } from '@/lib/server/guardrail'

// ── 事件订阅/广播：直接 re-export ──
export { subscribeExecutionEvents, emitBusEvent } from '@hermesclaw/openclaw-adapter'

// ── 仅本地保留：dispatchTaskEnvelope（HTTP connector + audit 域逻辑）──
import { emitBusEvent as _emitBus } from '@hermesclaw/openclaw-adapter'

/**
 * 分发并执行任务封包（旧实现）
 *
 * @deprecated 请逐步迁移至 createOpenClawAdapter(config).dispatch(envelope)
 */
export async function dispatchTaskEnvelope(envelope: TaskEnvelope): Promise<void> {
  TaskEnvelopeSchema.parse(envelope)
  await validateTaskAutomationLevel(envelope)

  try {
    const { writeAuditLog } = await import('@/lib/server/audit')
    await writeAuditLog({
      actor: envelope.agentId || 'system',
      action: 'task.dispatch',
      targetType: 'task',
      targetId: envelope.taskId,
      detail: `任务被派发至执行总线，ActionType: ${envelope.actionType}`,
      riskLevel: envelope.riskLevel === 'critical' ? 'high' : envelope.riskLevel,
      workspaceId: envelope.workspaceId || 'default',
    })
  } catch (error) {
    console.error('Failed to write task.dispatch audit log:', error)
  }

  const startTime = new Date()
  const { taskId, workflowRunId } = envelope

  const broadcast = (eventType: ExecutionEvent['eventType'], status: ExecutionEvent['status'], payload: Record<string, unknown>) => {
    const evt: ExecutionEvent = ExecutionEventSchema.parse({
      eventId: `evt-${crypto.randomUUID()}`,
      taskId,
      workflowRunId,
      runtimeId: 'openclaw-runtime',
      eventType,
      status,
      timestamp: new Date().toISOString(),
      payload,
      version: '1.0.0',
    })
    _emitBus(evt)
  }

  broadcast('run.started', 'started', { message: `Task ${taskId} execution started`, actionType: envelope.actionType })

  try {
    const lease = {
      leaseId: `lease-${crypto.randomUUID()}`,
      taskId,
      workspaceId: envelope.workspaceId,
      connectorId: 'http-connector',
      runtimeId: 'openclaw-runtime',
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      scope: ['write'],
      maxRiskLevel: envelope.riskLevel,
      status: 'active' as const,
      version: '1.0.0',
    }

    const receipt = await executeHttpConnector(lease, envelope.input, workflowRunId, envelope.idempotencyKey)
    if (receipt.outcome === 'failure') throw new Error(receipt.errorCode || 'HTTP Connector execution failed')

    broadcast('run.completed', 'completed', {
      message: `Task ${taskId} completed successfully`,
      outcome: receipt.outcome,
      receiptId: receipt.receiptId,
      idempotencyKey: receipt.idempotencyKey,
    })
    broadcast('run.progress', 'completed', {
      summary: receipt.response?.summary || `HTTP Connector executed. Response ID: ${receipt.receiptId}`,
      processedItems: 1,
      quality: 'high',
    })

    const { ExecutionSummarySchema } = await import('@hermesclaw/event-contracts')
    ExecutionSummarySchema.parse({
      summaryId: `sum-${crypto.randomUUID()}`,
      taskId,
      workflowRunId,
      finalStatus: 'completed',
      startedAt: startTime.toISOString(),
      completedAt: new Date().toISOString(),
      eventCount: 3,
      receiptHashes: [crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex')],
      version: '1.0.0',
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    broadcast('run.failed', 'failed', { error: errMsg, message: `Task ${taskId} execution failed` })
    try {
      const { ExecutionSummarySchema } = await import('@hermesclaw/event-contracts')
      ExecutionSummarySchema.parse({
        summaryId: `sum-${crypto.randomUUID()}`,
        taskId,
        workflowRunId,
        finalStatus: 'failed',
        startedAt: startTime.toISOString(),
        completedAt: new Date().toISOString(),
        eventCount: 2,
        error: errMsg,
        version: '1.0.0',
      })
    } catch (summaryErr) {
      console.error('Failed to generate execution summary:', summaryErr)
    }
  }
}

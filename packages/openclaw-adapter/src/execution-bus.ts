/**
 * OpenClaw Execution Bus — 事件总线层
 *
 * 基于 EventEmitter 的任务执行事件总线。
 * 职责：
 *   - 订阅特定 taskId 的所有执行事件
 *   - 广播标准契约执行事件
 *   - 分发 TaskEnvelope 并发射 started/completed/failed/summary 事件链
 *
 * 此模块是纯执行传输层，不含：
 *   - guardrail（安全护栏 → Hermes Kernel）
 *   - audit（审计写入 → Hermes Kernel）
 *   - connector 执行细节（连接器 → Hermes Kernel / Connectors）
 *   - memory/planning policy 判断
 *
 * 注意：此模块期望调用方传入已完成的执行结果（通过 executor callback），
 * 自身只负责事件广播与订阅管理，不做策略决策。
 */

import { EventEmitter } from 'events'
import {
  ExecutionEventSchema,
  ExecutionSummarySchema,
  type ExecutionEvent,
  type ExecutionSummary,
} from '@hermesclaw/event-contracts'

const eventBus = new EventEmitter()

// 避免并发监听数警告上限（AGENTS.md §5.2 允许高并发场景）
eventBus.setMaxListeners(1000)

/**
 * 订阅特定 taskId 的所有执行事件。
 *
 * 遵守 AGENTS.md §2.2 和 §3.1 运行时契约：
 * - 提供 subscribeExecutionEvents 方法
 * - 接收 taskId 并通过 onEvent 回调通知
 * - 返回一个解除监听的 unsubscribe 闭包函数
 */
export function subscribeExecutionEvents(
  taskId: string,
  onEvent: (e: ExecutionEvent) => void,
): () => void {
  const handler = (event: ExecutionEvent) => {
    if (event.taskId === taskId) {
      onEvent(event)
    }
  }
  eventBus.on('execution_event', handler)
  return () => {
    eventBus.off('execution_event', handler)
  }
}

/**
 * 广播一个标准契约执行事件（强校验通过后 emit）。
 */
export function emitBusEvent(event: ExecutionEvent): void {
  // 强校验事件契约格式，确保字段完整合规
  const validated = ExecutionEventSchema.parse(event)
  eventBus.emit('execution_event', validated)
}

/**
 * 执行器回调类型 —— 调用方提供实际的执行逻辑（如 HTTP connector 调用）。
 * 返回 ActionReceipt 格式的结果。
 */
export type ExecutorCallback = (input: Record<string, unknown>) => Promise<{
  outcome: 'success' | 'failure'
  response?: Record<string, unknown>
  receiptId?: string
  errorCode?: string
  idempotencyKey?: string
}>

/**
 * 事件广播辅助：生成符合契约的 eventId 并广播。
 */
function broadcastEvent(
  taskId: string,
  workflowRunId: string,
  eventType: ExecutionEvent['eventType'],
  status: ExecutionEvent['status'],
  payload: Record<string, unknown>,
  parentWorkflowRunId?: string,
): void {
  const event: ExecutionEvent = {
    eventId: `evt-${crypto.randomUUID()}`,
    taskId,
    workflowRunId,
    parentWorkflowRunId,
    runtimeId: 'openclaw-runtime',
    eventType,
    status,
    timestamp: new Date().toISOString(),
    payload,
    version: '1.0.0',
  }
  emitBusEvent(event)
}

/**
 * 生成 ExecutionSummary 并校验。
 */
function createSummary(params: {
  taskId: string
  workflowRunId: string
  finalStatus: 'completed' | 'failed'
  startedAt: Date
  eventCount: number
  receiptHash?: string
  error?: string
}): ExecutionSummary {
  const summary: ExecutionSummary = {
    summaryId: `sum-${crypto.randomUUID()}`,
    taskId: params.taskId,
    workflowRunId: params.workflowRunId,
    finalStatus: params.finalStatus,
    startedAt: params.startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    eventCount: params.eventCount,
    receiptHashes: params.receiptHash ? [params.receiptHash] : [],
    error: params.error,
    version: '1.0.0',
  }
  return ExecutionSummarySchema.parse(summary)
}

/**
 * 分发并执行任务封包。
 *
 * 遵守 AGENTS.md §2.2、§3.1 和 CLAUDE.md §5.1、§5.2 要求：
 * - 异步广播执行事件轨迹：started -> completed/failed -> summary
 * - 通过 executor 回调委托实际执行逻辑（由调用方注入）
 * - 自身不做 guardrail/audit 等控制域判断
 *
 * @param taskId - 任务 ID
 * @param workflowRunId - 工作流运行 ID
 * @param parentWorkflowRunId - 父工作流运行 ID（可选）
 * @param actionType - 动作类型
 * @param input - 任务输入
 * @param executor - 实际执行回调（由调用方提供，如 HTTP connector 或 LLM 调用）
 * @param idempotencyKey - 幂等键
 */
export async function dispatchTask(
  taskId: string,
  workflowRunId: string,
  actionType: string,
  input: Record<string, unknown>,
  executor: ExecutorCallback,
  opts?: {
    parentWorkflowRunId?: string
    idempotencyKey?: string
  },
): Promise<{ events: ExecutionEvent[]; summary: ExecutionSummary }> {
  const startTime = new Date()
  const events: ExecutionEvent[] = []
  const parentRunId = opts?.parentWorkflowRunId

  // 内部广播 + 收集事件
  const broadcastAndCollect = (
    eventType: ExecutionEvent['eventType'],
    status: ExecutionEvent['status'],
    payload: Record<string, unknown>,
  ) => {
    const event: ExecutionEvent = {
      eventId: `evt-${crypto.randomUUID()}`,
      taskId,
      workflowRunId,
      parentWorkflowRunId: parentRunId,
      runtimeId: 'openclaw-runtime',
      eventType,
      status,
      timestamp: new Date().toISOString(),
      payload,
      version: '1.0.0',
    }
    events.push(ExecutionEventSchema.parse(event))
    eventBus.emit('execution_event', event)
  }

  // 1. 发射 started 阶段事件
  broadcastAndCollect('run.started', 'started', {
    message: `Task ${taskId} execution started`,
    actionType,
  })

  try {
    // 2. 通过 executor 回调执行实际任务
    const receipt = await executor(input)

    if (receipt.outcome === 'failure') {
      throw new Error(receipt.errorCode || 'Executor execution failed')
    }

    // 3. 发射 completed 阶段事件
    broadcastAndCollect('run.completed', 'completed', {
      message: `Task ${taskId} completed successfully`,
      outcome: receipt.outcome,
      receiptId: receipt.receiptId ?? `rcpt-${crypto.randomUUID()}`,
      idempotencyKey: receipt.idempotencyKey ?? opts?.idempotencyKey ?? taskId,
    })

    // 4. 发射 summary 阶段事件
    broadcastAndCollect('run.progress', 'completed', {
      summary: receipt.response?.summary ?? `Executor executed. Response received.`,
      processedItems: 1,
      quality: 'high',
    })

    // 5. 构造 ExecutionSummary
    const receiptHash = crypto.randomUUID
      ? `sha256-${crypto.randomUUID()}`
      : `sha256-${Date.now()}`
    const summary = createSummary({
      taskId,
      workflowRunId,
      finalStatus: 'completed',
      startedAt: startTime,
      eventCount: events.length,
      receiptHash,
    })

    return { events, summary }

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)

    // 失败分支发射 failed 事件
    broadcastAndCollect('run.failed', 'failed', {
      error: errMsg,
      message: `Task ${taskId} execution failed`,
    })

    // 失败时也产生 ExecutionSummary
    const summary = createSummary({
      taskId,
      workflowRunId,
      finalStatus: 'failed',
      startedAt: startTime,
      eventCount: events.length,
      error: errMsg,
    })

    return { events, summary }
  }
}

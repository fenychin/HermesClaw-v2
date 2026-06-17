/**
 * ⚠️ DEPRECATED — 兼容层，已迁移至 @hermesclaw/openclaw-adapter
 *
 * 本文件不再持有任何实现，全部 re-export / 重命名自 @hermesclaw/openclaw-adapter。
 * 计划在 2026-07-01 删除。新代码请直接 import:
 *   import { emitEvent, subscribeEvents, ... } from '@hermesclaw/openclaw-adapter'
 */

import type { ExecutionEvent } from '@hermesclaw/event-contracts'
import { EXECUTION_EVENT_VERSION } from '@hermesclaw/event-contracts'
import {
  emitEvent,
  subscribeEvents,
  unsubscribeEvents,
  getSubscriberCount,
  sendHeartbeat,
  registerEventPublisher,
} from '@hermesclaw/openclaw-adapter'

// ── 直接 re-export（同名）──
export { sendHeartbeat, registerEventPublisher }
export type { EventSubscriptionFilter, EventPublisher as ExecutionEventPublisher } from '@hermesclaw/openclaw-adapter'

// ── 旧 API 重命名 re-export ──
/** @deprecated 使用 @hermesclaw/openclaw-adapter 的 emitEvent */
export const emitExecutionEvent = emitEvent

/** @deprecated 使用 @hermesclaw/openclaw-adapter 的 subscribeEvents */
export const subscribeOpenClawEvents = subscribeEvents

/** @deprecated 使用 @hermesclaw/openclaw-adapter 的 unsubscribeEvents */
export const unsubscribeOpenClawEvents = unsubscribeEvents

/** @deprecated 使用 @hermesclaw/openclaw-adapter 的 getSubscriberCount */
export const getOpenClawSubscriberCount = getSubscriberCount

/**
 * 兼容旧 API：把传统 task:started/workflow:completed 等枚举值映射为标准 ExecutionEvent 并发射。
 * 新代码请直接构造 ExecutionEvent 后调用 emitEvent。
 *
 * @deprecated
 */
export function emitOpenClawEvent(
  agentId: string,
  event: {
    type:
      | 'task:started' | 'task:progress' | 'task:completed' | 'task:failed' | 'task:cancelled'
      | 'connector:connected' | 'connector:disconnected' | 'connector:error'
      | 'workflow:started' | 'workflow:completed' | 'workflow:failed'
    payload: Record<string, unknown>
  },
): void {
  let status: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled' = 'progress'
  if (event.type.endsWith(':started')) status = 'started'
  else if (event.type.endsWith(':completed')) status = 'completed'
  else if (event.type.endsWith(':failed')) status = 'failed'
  else if (event.type.endsWith(':cancelled')) status = 'cancelled'

  let eventType: ExecutionEvent['eventType'] = 'run.progress'
  if (event.type.startsWith('task:')) {
    if (status === 'started') eventType = 'tool.call.started'
    else if (status === 'completed') eventType = 'tool.call.completed'
    else if (status === 'failed') eventType = 'tool.call.failed'
  } else if (event.type.startsWith('workflow:')) {
    if (status === 'started') eventType = 'run.started'
    else if (status === 'completed') eventType = 'run.completed'
    else if (status === 'failed') eventType = 'run.failed'
  }

  const taskId = (event.payload.taskId as string) || `t-${Date.now()}`
  const workflowRunId =
    (event.payload.workflowRunId as string) ||
    (event.payload.runId as string) ||
    `run-${Date.now()}`

  emitEvent({
    eventId: `evt-${crypto.randomUUID()}`,
    taskId,
    workflowRunId,
    runtimeId: 'openclaw-runtime',
    eventType,
    status,
    timestamp: new Date().toISOString(),
    payload: { ...event.payload, agentId },
    version: EXECUTION_EVENT_VERSION,
  })
}

/** @deprecated */
export function emitWorkflowEvent(
  runId: string,
  type: 'workflow:started' | 'workflow:completed' | 'workflow:failed',
  payload: Record<string, unknown> = {},
): void {
  emitOpenClawEvent('workflow', {
    type,
    payload: { workflowRunId: runId, ...payload },
  })
}

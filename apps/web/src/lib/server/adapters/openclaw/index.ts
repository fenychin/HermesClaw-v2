/**
 * ⚠️ DEPRECATED — 兼容层，仅保留 re-export
 *
 * 原 OpenClaw Adapter 已完整迁移至 @hermesclaw/openclaw-adapter。
 * 本文件将在 **2026-07-01** 前删除。
 *
 * 迁移路径：
 *   import { createOpenClawAdapter } from '@hermesclaw/openclaw-adapter'
 *   const adapter = createOpenClawAdapter(config)
 *   const { eventId } = await adapter.dispatch(envelope)
 *   const unsubscribe = adapter.subscribe(taskId, (event) => { ... })
 */

// ── 重新导出至 @hermesclaw/openclaw-adapter ──
export {
  createOpenClawAdapter,
} from '@hermesclaw/openclaw-adapter'
export type { ExecutionAdapter } from '@hermesclaw/openclaw-adapter'

// ── 旧 openclawClient（唯一仍保留实现的兼容层入口）──
// skill-executor.ts 仍依赖此导出，迁移后删除
export { openclawClient } from './client'

// ── 事件发射器兼容导出 ──
export {
  emitExecutionEvent,
  emitOpenClawEvent,
  subscribeOpenClawEvents,
  unsubscribeOpenClawEvents,
  getOpenClawSubscriberCount,
  sendHeartbeat,
} from './event-emitter'
export type {
  EventSubscriptionFilter,
} from './event-emitter'

// ── 旧类型兼容导出 ──
export type {
  OpenClawExecuteTaskRequest,
  OpenClawTaskResult,
  OpenClawTaskStatus,
  OpenClawConnectorStatus,
  OpenClawConnectorHealth,
  OpenClawSyncDataRequest,
  OpenClawSyncResult,
  OpenClawSyncStatus,
} from './types'

/**
 * OpenClaw Adapter 统一出口
 *
 * 使用方式：
 *   import { openclawClient, emitExecutionEvent } from '@/lib/server/adapters/openclaw'
 */

export { openclawClient } from './client'

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


/**
 * OpenClaw Adapter 统一出口
 *
 * 使用方式：
 *   import { openclawClient, emitOpenClawEvent } from '@/lib/server/adapters/openclaw'
 *   import type { OpenClawTaskResult } from '@/lib/server/adapters/openclaw'
 */

export { openclawClient } from './client'

export {
  emitOpenClawEvent,
  subscribeOpenClawEvents,
  unsubscribeOpenClawEvents,
  getOpenClawSubscriberCount,
  sendHeartbeat,
} from './event-emitter'

export type {
  OpenClawEvent,
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

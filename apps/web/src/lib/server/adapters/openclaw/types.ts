/**
 * ⚠️ DEPRECATED — 兼容层，已迁移至 @hermesclaw/openclaw-adapter
 *
 * 此文件全部类型现 re-export 自 @hermesclaw/openclaw-adapter。
 * 计划在 2026-07-01 删除。新代码请直接 import 包类型。
 */

export type {
  OpenClawExecuteTaskRequest,
  OpenClawTaskStatus,
  OpenClawTaskResult,
  OpenClawConnectorHealth,
  OpenClawConnectorStatus,
  OpenClawSyncDataRequest,
  OpenClawSyncStatus,
  OpenClawSyncResult,
} from '@hermesclaw/openclaw-adapter'

// ── 仅本地保留：契约 pact 测试用 zod schema（包未公开）──
import { z } from 'zod'

export const OPENCLAW_ADAPTER_CONTRACT_VERSION = 1

const OpenClawTaskStatusSchema = z.enum([
  'pending', 'executing', 'succeeded', 'failed', 'cancelled',
])

const OpenClawConnectorHealthSchema = z.enum(['healthy', 'degraded', 'down', 'unknown'])

const OpenClawSyncStatusSchema = z.enum([
  'initializing', 'syncing', 'completed', 'failed', 'partial',
])

export const OpenClawTaskResultSchema = z.object({
  taskId: z.string().min(1),
  status: OpenClawTaskStatusSchema,
  outputs: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  completedAt: z.string().optional(),
})

export const OpenClawConnectorStatusSchema = z.object({
  connectorId: z.string().min(1),
  name: z.string().min(1),
  health: OpenClawConnectorHealthSchema,
  lastHeartbeat: z.string().optional(),
  connectedSources: z.number().int().nonnegative(),
  version: z.string().min(1),
  latencyMs: z.number().nonnegative().optional(),
})

export const OpenClawSyncResultSchema = z.object({
  syncId: z.string().min(1),
  status: OpenClawSyncStatusSchema,
  totalRecords: z.number().int().nonnegative(),
  syncedRecords: z.number().int().nonnegative(),
  failedRecords: z.number().int().nonnegative(),
  errors: z.array(z.string()).optional(),
  startedAt: z.string().min(1),
  completedAt: z.string().optional(),
})

export const OPENCLAW_RESPONSE_SCHEMAS = {
  '/tasks/execute': OpenClawTaskResultSchema,
  '/connectors/status': OpenClawConnectorStatusSchema,
  '/data/sync': OpenClawSyncResultSchema,
} as const

/**
 * OpenClaw Adapter 标准接口类型定义
 *
 * 所有类型与底层 OpenClaw 版本解耦，作为稳定的接口契约存在。
 * 当底层 API 变更时，仅需在 client.ts 中做适配，本文件保持不变。
 */

// ─── 任务执行相关 ──────────────────────────────────────────────

/** 任务执行请求 */
export interface OpenClawExecuteTaskRequest {
  /** 任务唯一标识 */
  taskId: string
  /** 任务输入参数 */
  inputs: Record<string, unknown>
  /** 执行优先级（可选，默认 'normal'） */
  priority?: 'low' | 'normal' | 'high'
  /** 执行超时时间覆盖（毫秒，可选） */
  timeoutMs?: number
}

/** 任务执行状态 */
export type OpenClawTaskStatus =
  | 'pending'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

/** 任务执行结果 */
export interface OpenClawTaskResult {
  /** 任务 ID */
  taskId: string
  /** 执行状态 */
  status: OpenClawTaskStatus
  /** 执行输出 */
  outputs?: Record<string, unknown>
  /** 错误信息（仅 failed 状态） */
  error?: string
  /** 执行耗时（毫秒） */
  durationMs?: number
  /** 完成时间戳（ISO 8601） */
  completedAt?: string
}

// ─── 连接器相关 ──────────────────────────────────────────────

/** 连接器健康状态 */
export type OpenClawConnectorHealth = 'healthy' | 'degraded' | 'down' | 'unknown'

/** 连接器状态信息 */
export interface OpenClawConnectorStatus {
  /** 连接器 ID */
  connectorId: string
  /** 连接器名称 */
  name: string
  /** 健康状态 */
  health: OpenClawConnectorHealth
  /** 最后心跳时间（ISO 8601） */
  lastHeartbeat?: string
  /** 已连接数据源数量 */
  connectedSources: number
  /** 版本号 */
  version: string
  /** 延迟（毫秒） */
  latencyMs?: number
}

// ─── 数据同步相关 ──────────────────────────────────────────────

/** 数据同步请求 */
export interface OpenClawSyncDataRequest {
  /** 数据源标识 */
  source: string
  /** 目标标识 */
  target: string
  /** 同步模式 */
  mode?: 'full' | 'incremental'
  /** 过滤条件（可选） */
  filters?: Record<string, unknown>
}

/** 同步进度状态 */
export type OpenClawSyncStatus =
  | 'initializing'
  | 'syncing'
  | 'completed'
  | 'failed'
  | 'partial'

/** 数据同步结果 */
export interface OpenClawSyncResult {
  /** 同步任务 ID */
  syncId: string
  /** 同步状态 */
  status: OpenClawSyncStatus
  /** 同步记录总数 */
  totalRecords: number
  /** 已同步记录数 */
  syncedRecords: number
  /** 失败记录数 */
  failedRecords: number
  /** 错误信息（仅 failed/partial 状态） */
  errors?: string[]
  /** 开始时间（ISO 8601） */
  startedAt: string
  /** 完成时间（ISO 8601） */
  completedAt?: string
}

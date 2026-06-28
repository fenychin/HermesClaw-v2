/**
 * 连接器（Connector / MCP）领域类型
 * —— 对应 PRD 10.6.5 连接器 MCP，统一管理外部工具与数据源接入
 *
 * 三域归属：OpenClaw Execution Runtime（连接器健康状态 / ActionReceipt / ConnectorLease）
 */

import type { AutomationLevel } from "@hermesclaw/event-contracts"

export type ConnectorStatus = 'connected' | 'available' | 'error' | 'connecting'
export type ConnectorCategory = 'email' | 'im' | 'crm' | 'erp' | 'document' | 'data' | 'api'

/** 连接器来源 */
export type ConnectorSource = 'builtin' | 'industry-pack' | 'custom'

/** 连接器健康状态（四态） */
export type ConnectorHealth = 'active' | 'degraded' | 'disabled' | 'error'

/** ConnectorLease 租用状态 */
export type LeaseStatus = 'active' | 'expired' | 'revoked' | 'none'

/** ConnectorLease — 连接器使用租约（Hermes 授予 Runtime 在限定窗口内使用某连接器） */
export interface ConnectorLease {
  leaseId: string
  connectorId: string
  workspaceId: string
  taskId?: string
  runtimeId: string
  grantedAt: string
  expiresAt: string
  /** 允许的操作作用域，如 ["read", "send", "write"] */
  scope: string[]
  /** 租约允许的最高风险等级 */
  maxRiskLevel: 'low' | 'medium' | 'high' | 'critical'
  /** 租约状态 */
  status: LeaseStatus
  /** 契约版本 */
  version: string
}

export type { AutomationLevel }

export interface Connector {
  id: string
  name: string
  iconEmoji: string
  description: string
  status: ConnectorStatus
  category: ConnectorCategory
  /** 连接器来源：系统内置 / 行业包安装 / 用户自建 */
  source: ConnectorSource
  lastSync?: string
  permissions: string[]
  usedByAgents: string[]
  failureCount?: number
  authScope?: 'readonly' | 'readwrite'
  configStatus?: 'connected' | 'error' | 'pending_config'
  packId?: string
  version?: string
  health?: ConnectorHealth
  /** 成功率（0-100），从 ActionReceipt 表实时计算 */
  successRate?: number
  /** 失败率（0-100），从 ActionReceipt 表实时计算 */
  failureRate?: number
  /** 最近一次 ActionReceipt 时间 */
  lastReceiptAt?: string
  /** 调用此连接器所需的最低自动化等级 */
  requiredAutomationLevel?: AutomationLevel
  /** 租用状态 */
  leaseStatus?: LeaseStatus
  /** 最后心跳时间 */
  lastHeartbeatAt?: string
  /** 总调用次数（所有时间） */
  totalCalls?: number
}

/** 连接器测试结果 */
export interface ConnectorTestResult {
  success: boolean
  latencyMs: number
  timestamp: string
  error?: string
  details?: Record<string, unknown>
}

/** 连接器用量快照 */
export interface ConnectorUsage {
  connectorId: string
  totalCalls24h: number
  successRate24h: number
  avgLatencyMs24h: number
  lastTestResult?: ConnectorTestResult
  lastError?: { timestamp: string; message: string }
  lastSuccessAt?: string
  recentEvents: ConnectorEvent[]
}

export interface ConnectorEvent {
  id: string
  action: string
  status: 'success' | 'failed' | 'pending'
  timestamp: string
  detail: string
  latencyMs?: number
}

/** 连接器自检项 */
export interface ConnectorSelfCheck {
  label: string
  key: string
  status: 'pending' | 'running' | 'pass' | 'fail'
  detail?: string
}

/** ActionReceipt — 执行证据（OpenClaw 回执） */
export interface ActionReceipt {
  receiptId: string
  receiptHash?: string
  taskId: string
  workflowRunId: string
  connectorId: string
  idempotencyKey: string
  outcome: 'success' | 'failure'
  executedAt: string
  response?: Record<string, unknown>
  errorCode?: string
  failureReason?: string
  retryable: boolean
  durationMs?: number
  compensationStrategy?: string
  version: string
  createdAt: string
}

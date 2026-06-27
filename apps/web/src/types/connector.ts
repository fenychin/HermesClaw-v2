/**
 * 连接器（Connector / MCP）领域类型
 * —— 对应 PRD 10.6.5 连接器 MCP，统一管理外部工具与数据源接入
 */

export type ConnectorStatus = 'connected' | 'available' | 'error' | 'connecting'
export type ConnectorCategory = 'email' | 'im' | 'crm' | 'erp' | 'document' | 'data' | 'api'

/** 连接器来源 */
export type ConnectorSource = 'builtin' | 'industry-pack' | 'custom'

/** 连接器健康状态（四态） */
export type ConnectorHealth = 'active' | 'degraded' | 'disabled' | 'error'

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

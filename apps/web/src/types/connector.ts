/**
 * 连接器（Connector / MCP）领域类型
 * —— 对应 PRD 10.6.5 连接器 MCP，统一管理外部工具与数据源接入
 */

export type ConnectorStatus = 'connected' | 'available' | 'error' | 'connecting'
export type ConnectorCategory = 'email' | 'im' | 'crm' | 'erp' | 'document' | 'data' | 'api'

export interface Connector {
  id: string
  name: string
  iconEmoji: string
  description: string
  status: ConnectorStatus
  category: ConnectorCategory
  lastSync?: string
  permissions: string[]
  usedByAgents: string[]
  failureCount?: number
  authScope?: 'readonly' | 'readwrite'
  configStatus?: 'connected' | 'error' | 'pending_config'
  packId?: string
}

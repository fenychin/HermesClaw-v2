export type CapabilityType = 'skill' | 'connector' | 'workflow' | 'tool' | 'channel' | 'device'
export type CapabilityStatus = 'draft' | 'active' | 'deprecated' | 'yanked' | 'available' | 'degraded' | 'unavailable' | 'unregistered'
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

export interface CapabilityRegistration {
  capabilityId: string
  runtimeId?: string                 // Legacy support
  type?: CapabilityType              // Legacy support
  capabilityType?: CapabilityType
  version: string                   // semver
  workspaceId: string
  name?: string                      // Legacy support
  supportedActionTypes?: unknown[]       // Legacy support
  automationLevelCeiling?: unknown       // Legacy support
  riskLevelCeiling?: unknown             // Legacy support
  registeredAt?: Date                // Legacy support
  lastHeartbeatAt?: Date             // Legacy support
  displayName?: string
  description?: string
  inputSchema?: Record<string, unknown>   // JSON Schema
  outputSchema?: Record<string, unknown>  // JSON Schema
  tags?: string[]
  status?: CapabilityStatus
  healthStatus?: HealthStatus
  successCount?: number
  failureCount?: number
  avgLatencyMs?: number
  lastHealthCheckAt?: Date
  changelog?: string
  publishedAt?: Date
  publishedBy?: string
  deprecatedAt?: Date
  deprecatedBy?: string
  deprecationReason?: string
}

// 能力描述符（Agent 调用时传入）
export interface CapabilityDescriptor {
  capabilityId: string
  capabilityType: CapabilityType
  version?: string    // 若不传则解析为 latest active 版本
  workspaceId: string
}

// 能力解析结果
export interface ResolvedCapability {
  registration: CapabilityRegistration
  endpoint?: string   // 运行时调用端点（Connector 有值）
  skillHandler?: string  // Skill 处理器标识
}


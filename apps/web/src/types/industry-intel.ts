/**
 * Industry Intelligence Center — 前端类型定义
 *
 * 三域原则：此处类型仅描述前端视图层需要的数据形态，
 * 不对应任何后端实现细节。所有领域判断逻辑由服务端完成。
 *
 * 数据来源：
 * - event-contracts: IndustryIntelSnapshot, ScenarioResult, IntelSSEEvent, etc.
 * - industry-pack-sdk: DashboardConfig, PanelConfig
 */
import type {
  DashboardConfig,
  PanelConfig,
  IndustryIntelSnapshot,
  RadarDimension,
  ScenarioResult,
  PredictionPath,
  SandboxScenarioRequest,
  IntelFlowTick,
  IntelSignalDetected,
  IntelTopologyUpdated,
  IntelAlertTactical,
  IntelEvolutionProposalCreated,
  IntelAgentHeartbeat,
} from "@hermesclaw/event-contracts"

// 重导出契约类型，避免组件直接 import event-contracts
export type {
  DashboardConfig,
  PanelConfig,
  IndustryIntelSnapshot,
  RadarDimension,
  ScenarioResult,
  PredictionPath,
  SandboxScenarioRequest,
  IntelFlowTick,
  IntelSignalDetected,
  IntelTopologyUpdated,
  IntelAlertTactical,
  IntelEvolutionProposalCreated,
  IntelAgentHeartbeat,
}

/** 行业标识 */
export type IndustryId = string

/** 行业切换选项 */
export interface IndustryOption {
  id: IndustryId
  name: string
  packId: string
  isIntelCenter: boolean
}

/** Agent 心跳状态（客户端聚合） */
export interface AgentHeartbeatState {
  agentId: "A1" | "A2" | "A3" | "A4" | "A5"
  label: string
  status: "online" | "degraded" | "offline"
  lastHeartbeatAt: string | null
  heartbeatIntervalMs: number
  automationLevel: "L1" | "L2"
}

/** 全局告警项（来自 intel.alert.tactical） */
export interface TacticalAlert {
  id: string
  eventType: "intel.alert.tactical"
  payload: IntelAlertTactical
  timestamp: string
  acknowledged: boolean
}

/** 连接器健康状态 */
export interface ConnectorHealthItem {
  connectorId: string
  name: string
  status: "healthy" | "degraded" | "down"
  lastHeartbeat: string | null
  latencyMs: number
}

/** SSE 连接状态 */
export type SSEConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting"

/** 客户端沙盘提交输入（映射到 SandboxScenarioRequest 之前） */
export interface SandboxSubmitInput {
  packId: string
  scenario: string
  hypothesis: string
  timeHorizon: string
  automationLevel: "L1"
}

/** 客户端轮询到的推演结果（包装 ScenarioResult） */
export interface ScenarioResultWithStatus extends ScenarioResult {
  status: "completed" | "failed" | "running"
}

/** 行业情报中心全局状态（Zustand store） */
export interface IndustryIntelState {
  /** 当前选中行业 */
  activeIndustryId: IndustryId | null
  /** 可用行业列表 */
  industryOptions: IndustryOption[]
  /** SSE 连接状态 */
  sseStatus: SSEConnectionStatus
  /** Agent 心跳状态映射 */
  agentHeartbeats: Record<string, AgentHeartbeatState>
  /** 未确认告警列表 */
  alerts: TacticalAlert[]
  /** 当前 Dashboard 配置 */
  dashboardConfig: DashboardConfig | null
  /** 全局威胁等级 */
  globalThreatLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  /** 数据源连接器健康列表 */
  connectorHealth: ConnectorHealthItem[]
}

import { z } from "zod"
import {
  IdSchema,
  TimestampSchema,
  VersionSchema,
} from "./shared"

/** Intel SSE 事件流协议版本。 */
export const INTEL_SSE_EVENT_VERSION = "1.0.0"

// ─── intel.flow.tick ──────────────────────────────────────────────────

/**
 * intel.flow.tick — 资金流向心跳数据。
 *
 * 由 A2 数据流量动力学 Agent 每 3s 推送一次到 OpenClaw SSE 流。
 * 前端 P2 板块 CapitalFlowCurve 消费，本地 circular buffer 保留约 15min 历史。
 */
export const IntelFlowTickSchema = z.object({
  eventType: z.literal("intel.flow.tick"),
  /** 事件发生时刻。 */
  timestamp: TimestampSchema,
  /** 资金流向指数（0-100，相对基准线）。 */
  capitalFlowIndex: z.number().min(0).max(100),
  /** 成交量指数（0-100，相对基准线）。 */
  volumeIndex: z.number().min(0).max(100),
  /** 市场代码/区域。 */
  region: z.string().optional(),
  /** 事件协议版本。 */
  version: VersionSchema,
})
export type IntelFlowTick = z.infer<typeof IntelFlowTickSchema>

// ─── intel.signal.detected ────────────────────────────────────────────

/**
 * intel.signal.detected — 战术信号检测事件。
 *
 * 由 A1 战略态势感知 Agent 异步推送。
 * 前端 P1 板块 TacticalEventFeed + CommandTicker 消费。
 */
export const IntelSignalDetectedSchema = z.object({
  eventType: z.literal("intel.signal.detected"),
  /** 信号唯一 ID。 */
  signalId: IdSchema,
  /** 信号标题。 */
  title: z.string().min(1),
  /** 威胁等级（L1=蓝 L2=橙 L3=红）。 */
  threatLevel: z.enum(["L1", "L2", "L3"]),
  /** 置信度（0-1）。 */
  confidence: z.number().min(0).max(1),
  /** 信号来源。 */
  source: z.string().optional(),
  /** 检测到信号的时刻。 */
  detectedAt: TimestampSchema,
  /** 事件协议版本。 */
  version: VersionSchema,
})
export type IntelSignalDetected = z.infer<typeof IntelSignalDetectedSchema>

// ─── intel.topology.updated ───────────────────────────────────────────

/**
 * 图谱节点（用于 intel.topology.updated 差量推送）。
 */
export const GraphNodeSchema = z.object({
  /** 节点唯一 ID。 */
  id: IdSchema,
  /** 节点标签。 */
  label: z.string().min(1),
  /** 节点分类（如 "company", "product", "policy", "market", "capital"）。 */
  category: z.string().min(1),
  /** 节点权重（0-1，影响节点大小）。 */
  weight: z.number().min(0).max(1).optional(),
  /** 节点附加元数据。 */
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type GraphNode = z.infer<typeof GraphNodeSchema>

/**
 * 图谱边（用于 intel.topology.updated 差量推送）。
 */
export const GraphEdgeSchema = z.object({
  /** 边唯一 ID。 */
  id: IdSchema,
  /** 源节点 ID。 */
  source: IdSchema,
  /** 目标节点 ID。 */
  target: IdSchema,
  /** 边关系类型。 */
  relation: z.string().min(1),
  /** 边权重（0-1，影响连线粗细）。 */
  weight: z.number().min(0).max(1).optional(),
})
export type GraphEdge = z.infer<typeof GraphEdgeSchema>

/**
 * intel.topology.updated — 行业图谱差量更新事件。
 *
 * 由 A3 行业生态星云 Agent 每 5min 批次推送。
 * 前端 P3 板块 NebulaCoreCanvas 消费，只处理 diff 不重绘全图。
 */
export const IntelTopologyUpdatedSchema = z.object({
  eventType: z.literal("intel.topology.updated"),
  /** 新增节点列表。 */
  added: z.array(GraphNodeSchema).default([]),
  /** 移除节点 ID 列表。 */
  removed: z.array(IdSchema).default([]),
  /** 更新边列表（新增或权重变化）。 */
  updated: z.array(GraphEdgeSchema).default([]),
  /** 推送时刻。 */
  timestamp: TimestampSchema,
  /** 事件协议版本。 */
  version: VersionSchema,
})
export type IntelTopologyUpdated = z.infer<typeof IntelTopologyUpdatedSchema>

// ─── intel.alert.tactical ─────────────────────────────────────────────

/**
 * intel.alert.tactical — 战术告警事件。
 *
 * 触发条件：A1 检测到 threatLevel >= HIGH 或 signalDelta > 2σ。
 * 前端 ThreatAlertModal 消费，为 P0 优先级（立即，不节流）。
 */
export const IntelAlertTacticalSchema = z.object({
  eventType: z.literal("intel.alert.tactical"),
  /** 告警唯一 ID。 */
  alertId: IdSchema,
  /** 告警标题。 */
  title: z.string().min(1),
  /** 告警详细描述。 */
  description: z.string().default(""),
  /** 影响分析。 */
  impactAnalysis: z.string().optional(),
  /** 建议的战术动作。 */
  suggestedAction: z.string().optional(),
  /** 告警等级。 */
  threatLevel: z.enum(["HIGH", "CRITICAL"]),
  /** 告警触发时刻。 */
  triggeredAt: TimestampSchema,
  /** 关联信号 ID 列表。 */
  linkedSignalIds: z.array(IdSchema).default([]),
  /** 事件协议版本。 */
  version: VersionSchema,
})
export type IntelAlertTactical = z.infer<typeof IntelAlertTacticalSchema>

// ─── intel.evolution.proposal-created ─────────────────────────────────

/**
 * intel.evolution.proposal-created — 进化提案创建事件。
 *
 * 由 A5 人机进化核心 Agent 异步推送。
 * 前端 P5 板块 EvolutionProposalList 消费。
 */
export const IntelEvolutionProposalCreatedSchema = z.object({
  eventType: z.literal("intel.evolution.proposal-created"),
  /** 提案唯一 ID。 */
  proposalId: IdSchema,
  /** 提案类型。 */
  proposalType: z.enum([
    "WorkflowTemplate",
    "AgentPolicy",
    "SkillBinding",
    "ContextPolicy",
    "MemoryPolicy",
    "ConnectorPolicy",
    "EvalRuleSet",
  ]),
  /** AI 置信度（0-1）。 */
  confidence: z.number().min(0).max(1),
  /** 提案触发时刻。 */
  createdAt: TimestampSchema,
  /** 关联的 EvolutionProposal ID。 */
  evolutionProposalId: IdSchema.optional(),
  /** 事件协议版本。 */
  version: VersionSchema,
})
export type IntelEvolutionProposalCreated = z.infer<
  typeof IntelEvolutionProposalCreatedSchema
>

// ─── intel.agent.heartbeat ────────────────────────────────────────────

/**
 * intel.agent.heartbeat — Agent 心跳在线状态事件。
 *
 * 每个 Agent 每 30s 推送一次。前端 TopBar AgentHeartbeatRow 消费。
 */
export const IntelAgentHeartbeatSchema = z.object({
  eventType: z.literal("intel.agent.heartbeat"),
  /** Agent 唯一标识（A1-A5）。 */
  agentId: z.enum(["A1", "A2", "A3", "A4", "A5"]),
  /** Agent 当前状态。 */
  status: z.enum(["running", "degraded", "error", "idle"]),
  /** 最近一次运行开始时刻。 */
  lastRunAt: TimestampSchema.optional(),
  /** 预计下次运行时刻。 */
  nextRunAt: TimestampSchema.optional(),
  /** 心跳发出时刻。 */
  heartbeatAt: TimestampSchema,
  /** 事件协议版本。 */
  version: VersionSchema,
})
export type IntelAgentHeartbeat = z.infer<typeof IntelAgentHeartbeatSchema>

// ─── 统一 discriminatedUnion ─────────────────────────────────────────

/**
 * IntelSSEEvent —— 所有 intel.* SSE 事件的 discriminatedUnion。
 *
 * 前端 useIntelStream hook 通过此 schema 解析 EventSource 消息，
 * 然后按 eventType 分发到对应组件。
 *
 * 用法：
 *   const event = IntelSSEEventSchema.parse(JSON.parse(eventSource.data))
 *   switch (event.eventType) {
 *     case "intel.flow.tick":        // event: IntelFlowTick
 *     case "intel.signal.detected":  // event: IntelSignalDetected
 *     // ...
 *   }
 */
export const IntelSSEEventSchema = z.discriminatedUnion("eventType", [
  IntelFlowTickSchema,
  IntelSignalDetectedSchema,
  IntelTopologyUpdatedSchema,
  IntelAlertTacticalSchema,
  IntelEvolutionProposalCreatedSchema,
  IntelAgentHeartbeatSchema,
])
export type IntelSSEEvent = z.infer<typeof IntelSSEEventSchema>

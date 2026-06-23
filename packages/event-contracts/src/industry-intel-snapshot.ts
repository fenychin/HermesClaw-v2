import { z } from "zod"
import {
  IdSchema,
  TimestampSchema,
  VersionSchema,
} from "./shared"

/** IndustryIntelSnapshot 独立契约版本。 */
export const INDUSTRY_INTEL_SNAPSHOT_VERSION = "1.0.0"

/**
 * 雷达维度 —— IndustryIntelSnapshot.radarSection.dimensions 的子对象。
 *
 * 8 个维度各含 0-100 分值与可读标签。
 * 维度名来自 PRD 2.0 §3.1 A1 雷达计算：市场热度/竞对强度/政策风险/
 * 资金流向/技术变化/舆情温度/供应链压力/监管密度。
 */
export const RadarDimensionSchema = z.object({
  /** 维度标识（如 "market-heat"）。 */
  key: IdSchema,
  /** 维度可读标签（如 "市场热度"）。 */
  label: z.string().min(1),
  /** 维度分值（0-100）。 */
  value: z.number().min(0).max(100),
  /** 较上次变化的增量（正=恶化/升温，负=改善/降温）。 */
  delta: z.number().optional(),
  /** 数据来源描述。 */
  source: z.string().optional(),
})
export type RadarDimension = z.infer<typeof RadarDimensionSchema>

/**
 * 信号条目 —— IndustryIntelSnapshot.signalFeed 的子对象。
 *
 * 对应 PRD 2.0 前端 P1 板块的 TacticalEventFeed 数据源。
 */
export const SignalItemSchema = z.object({
  /** 信号唯一 ID。 */
  signalId: IdSchema,
  /** 信号标题。 */
  title: z.string().min(1),
  /** 信号详细描述。 */
  description: z.string().default(""),
  /** 威胁等级（L1=蓝 L2=橙 L3=红）。 */
  threatLevel: z.enum(["L1", "L2", "L3"]),
  /** 置信度（0-1）。 */
  confidence: z.number().min(0).max(1),
  /** 信号来源。 */
  source: z.string().default(""),
  /** 检测到信号的时刻（ISO-8601）。 */
  detectedAt: TimestampSchema,
  /** 关联的原始数据引用。 */
  rawRef: z.string().optional(),
  /** 关联的区域标签。 */
  region: z.string().optional(),
})
export type SignalItem = z.infer<typeof SignalItemSchema>

/**
 * IndustryIntelSnapshot —— 行业情报总快照。
 *
 * GET /api/v1/industry/kpi-snapshot 响应体。
 * 由 A1 战略态势感知 Agent 定时心跳产出，被前端板块 1/4/5 消费。
 *
 * 域归属：Industry Pack Layer 产出，Hermes 缓存层存储，前端视图消费。
 * 对应 AGENTS.md §3.3 共享数据对象。
 */
export const IndustryIntelSnapshotSchema = z.object({
  /** 快照唯一 ID。 */
  snapshotId: IdSchema,
  /** 行业包 ID。 */
  industryId: IdSchema,
  /** 租户 / 工作区 ID。 */
  workspaceId: IdSchema,
  /** 快照生成时刻（ISO-8601）。 */
  generatedAt: TimestampSchema,
  /** AI 模型综合置信度（0-100）。 */
  modelConfidence: z.number().min(0).max(100),
  /** 进化代际（GEN-N，= HarnessBundle 历史激活版本数）。 */
  evolutionGeneration: z.number().int().nonnegative(),
  /** 当前行业威胁等级。 */
  threatLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  /** 雷达区域（8 维指标）。 */
  radarSection: z.object({
    /** 雷达维度列表。 */
    dimensions: z.array(RadarDimensionSchema).min(1).max(16),
  }),
  /** 最新信号流（最多 50 条）。 */
  signalFeed: z.array(SignalItemSchema).max(50),
  /** 系统运行状态。 */
  systemStatus: z.enum(["OPERATIONAL", "DEGRADED", "OFFLINE"]),
  /** 契约版本。 */
  version: VersionSchema,
})
export type IndustryIntelSnapshot = z.infer<typeof IndustryIntelSnapshotSchema>

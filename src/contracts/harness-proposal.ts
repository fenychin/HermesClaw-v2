import { z } from "zod"
import {
  AutomationLevelSchema,
  IdSchema,
  RiskLevelSchema,
  VersionSchema,
} from "./shared"

/** HarnessProposal 独立契约版本。 */
export const HARNESS_PROPOSAL_VERSION = "1.0.0"

/** 提案状态（AGENTS.md §3.3：pending → approved/rejected/rolled-back）。 */
export const ProposalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "rolled-back",
])
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>

/** Harness 目标组件（AGENTS.md §4.1-§4.6 六大核心组件）。 */
export const TargetComponentSchema = z.enum([
  "任务边界",
  "上下文供给",
  "工具接入",
  "反馈闭环",
  "安全护栏",
  "进化调度器",
])
export type TargetComponent = z.infer<typeof TargetComponentSchema>

/**
 * HarnessProposal —— Harness 升级提案（Hermes 自演化引擎核心产物的契约表示）。
 *
 * Hermes 是 HarnessProposal 的 Source of Truth（AGENTS.md §3.1）。
 * 提案由 Harness 评估引擎自动生成或人工触发，经审批流程后可执行/拒绝/回滚。
 *
 * 字段对齐 Prisma HarnessProposal 模型（单源），与 types/harness.ts 的 UI 兼容层
 * 通过 re-export 消费，禁止手写重复 interface。
 */
export const HarnessProposalSchema = z.object({
  /** 提案唯一 ID（UUID）。 */
  id: IdSchema,
  /** 租户 / 工作区 ID（RBAC 隔离，§4.11）。 */
  workspaceId: IdSchema.default("default"),
  /** 人类可读提案编号（HEP-{timestamp}）。 */
  proposalId: IdSchema,
  /** 触发方式：auto（评估引擎自动）/ manual（人工触发）。 */
  triggeredBy: z.enum(["auto", "manual"]),
  /** 问题描述（中文）。 */
  problemStatement: z.string().min(1),
  /** 支撑证据（JSON 字符串数组，DB 层存储为 JSON 文本）。 */
  evidence: z.array(z.string()).default([]),
  /** 升级目标组件（六大核心组件之一）。 */
  targetComponent: TargetComponentSchema,
  /** 具体变更描述（中文）。 */
  proposedChange: z.string().min(1),
  /** 风险等级（low/medium/high，不含 critical）。 */
  riskLevel: RiskLevelSchema,
  /** 自动化授权等级 L1–L4（§4.7）。 */
  automationLevel: AutomationLevelSchema,
  /** 提案状态。 */
  status: ProposalStatusSchema,
  /** 预期影响描述（中文）。 */
  estimatedImpact: z.string(),
  /** 审批人（批准/拒绝后填入）。 */
  reviewedBy: z.string().nullable().optional(),
  /** 审批时间（ISO-8601）。 */
  reviewedAt: z.string().nullable().optional(),
  /** 回滚前快照（JSON，用于一键回滚）。 */
  previousSnapshot: z.unknown().nullable().optional(),
  /** 创建时间（ISO-8601）。 */
  createdAt: z.string(),
  /** 更新时间（ISO-8601）。 */
  updatedAt: z.string(),
  /** 契约版本。 */
  version: VersionSchema,
})

export type HarnessProposal = z.infer<typeof HarnessProposalSchema>

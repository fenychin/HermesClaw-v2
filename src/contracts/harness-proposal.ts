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
  "draft",
  "canary",
  "active",
  "deprecated",
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
  /** 提案唯一 ID (UUID/cuid) */
  id: IdSchema,
  /** 租户 / 工作区 ID（RBAC 隔离，§4.11） */
  workspaceId: IdSchema.default("default"),
  /** 人类可读提案编号（HEP-{timestamp}） */
  proposalId: IdSchema,
  /** 触发方式：auto（评估引擎自动）/ manual（人工触发） */
  triggeredBy: z.enum(["auto", "manual"]),
  /** 触发原因 */
  triggerReason: z.string().default(""),
  /** 问题描述（中文） */
  problemStatement: z.string().min(1),
  /** 支撑证据 */
  evidence: z.array(z.string()).default([]),
  /** 升级提案详细变更内容 */
  proposedChange: z.object({
    targetComponent: TargetComponentSchema,
    description: z.string(),
    riskLevel: RiskLevelSchema,
    automationLevel: AutomationLevelSchema,
  }),
  /** 关联的具体 Skill ID（L3 审批门禁据此匹配；非 skill 类提案为 null/缺省） */
  targetSkillId: z.string().nullable().optional(),
  /** 是否需要人工审批（§3.1） */
  requiresHumanApproval: z.boolean().default(true),
  /** 预期影响描述（中文） */
  estimatedImpact: z.string(),
  /** 关联/受影响的 Agent */
  affectedAgents: z.array(z.string()).default([]),
  /** 回滚方案说明 */
  rollbackPlan: z.string().default(""),
  /** 提案状态 */
  status: ProposalStatusSchema,
  /** 审批人 */
  reviewedBy: z.string().nullable().optional(),
  /** 审批时间 */
  reviewedAt: z.union([z.string(), z.date()]).nullable().optional(),
  /** 回滚前快照（JSON） */
  previousSnapshot: z.unknown().nullable().optional(),
  /** 创建时间 */
  createdAt: z.union([z.string(), z.date()]),
  /** 更新时间 */
  updatedAt: z.union([z.string(), z.date()]),
  /** 契约版本 */
  version: VersionSchema.default(HARNESS_PROPOSAL_VERSION),
})

export type HarnessProposal = z.infer<typeof HarnessProposalSchema>

// ==============================
// Harness 评估 / 提案 API 输入校验 Schema（契约层）
// ==============================

export const HarnessEvaluateSchema = z.object({
  triggeredBy: z.enum(["auto", "manual"]).optional().default("manual"),
});

export const HarnessProposalCreateSchema = z.object({
  proposalId: z.string().max(50).optional(),
  triggeredBy: z.enum(["auto", "manual"]).optional().default("auto"),
  problemStatement: z.string().min(1).max(2000),
  evidence: z.array(z.unknown()).optional().default([]),
  targetComponent: z.string().min(1).max(100),
  proposedChange: z.string().min(1).max(2000),
  riskLevel: z.enum(["low", "medium", "high"]).optional().default("low"),
  automationLevel: z.enum(["L1", "L2", "L3", "L4"]).optional(),
  status: z.enum(["pending", "approved", "rejected", "implemented"]).optional().default("pending"),
  estimatedImpact: z.string().max(500).optional().default(""),
  reviewedBy: z.string().max(50).nullable().optional().default(null),
  reviewedAt: z.string().nullable().optional().default(null),
});

export const HarnessProposalUpdateSchema = z.object({
  action: z.enum(["approve", "reject"]).optional(),
  reviewedBy: z.string().max(50).optional().default("system"),
  confirm: z.boolean().optional(),
  status: z.string().max(20).optional(),
  reviewedAt: z.string().optional(),
});

export const HarnessSpecGenerateSchema = z.object({
  businessIntent: z.string().min(1).max(1000),
  industry: z.string().min(1).max(100),
  agentRole: z.string().min(1).max(100),
});


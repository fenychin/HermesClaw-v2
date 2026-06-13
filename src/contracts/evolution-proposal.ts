import { z } from "zod"
import {
  AutomationLevelSchema,
  IdSchema,
  RiskLevelSchema,
  VersionSchema,
} from "./shared"
import { TargetComponentSchema } from "./harness-proposal"

/** EvolutionProposal 独立契约版本。 */
export const EVOLUTION_PROPOSAL_VERSION = "1.0.0"

/**
 * EvolutionProposal —— 进化提案（AGENTS.md §3.3 自演化系统核心对象）。
 *
 * 与 HarnessProposal 的区别：
 * - HarnessProposal 是 Harness 层面的配置/策略变更提案（Hermes 控制面）。
 * - EvolutionProposal 是 Runtime 层面的自演化产物，由 Harness 评估引擎依据
 *   运行指标（成功率、失败率、连接器成功率等）自动触发，指向具体的
 *   WorkflowTemplate / AgentPolicy / EvalRuleSet 等 Runtime 对象变更。
 *
 * CLAUDE.md §7.2 明确列出 EvolutionProposal 为必须版本化的对象。
 * 对应 AGENTS.md §3.3 Level 2 评估层 → Level 3 演化提案。
 */
export const EvolutionProposalSchema = z.object({
  /** 提案唯一 ID。 */
  proposalId: IdSchema,
  /** 关联的 HarnessProposal ID（审批流转后建立关联）。 */
  harnessProposalId: z.string().optional(),
  /** 所属工作区 ID。 */
  workspaceId: IdSchema.default("default"),
  /** 触发方式：auto（评估引擎）/ manual（人工触发）。 */
  triggeredBy: z.enum(["auto", "manual"]),
  /** 触发原因（如 "failureRate exceeded 0.1"）。 */
  triggerReason: z.string().min(1),
  /** 问题陈述（中文）。 */
  problemStatement: z.string().min(1),
  /** 支撑证据（日志/指标引用）。 */
  evidence: z.array(z.string()).default([]),
  /** 目标组件类型。 */
  targetComponent: TargetComponentSchema,
  /** 目标对象 ID（如 WorkflowTemplate.templateId / AgentPolicy.policyId）。 */
  targetObjectId: IdSchema,
  /** 目标对象类型（对应 HarnessBundle 子对象名）。 */
  targetObjectType: z.enum([
    "WorkflowTemplate",
    "AgentPolicy",
    "SkillBinding",
    "ContextPolicy",
    "MemoryPolicy",
    "ConnectorPolicy",
    "EvalRuleSet",
  ]),
  /** 变更前快照（JSON，用于对比与回滚）。 */
  previousState: z.unknown().optional(),
  /** 变更后目标状态（JSON）。 */
  proposedState: z.unknown(),
  /** 风险等级。 */
  riskLevel: RiskLevelSchema,
  /** 自动化授权等级。 */
  automationLevel: AutomationLevelSchema,
  /** 是否需要人工审批。 */
  requiresHumanApproval: z.boolean().default(true),
  /** 预期影响描述。 */
  estimatedImpact: z.string().default(""),
  /** 回滚计划描述。 */
  rollbackPlan: z.string().default(""),
  /** 关联评估指标快照。 */
  evaluationMetrics: z
    .object({
      errorRate: z.number().min(0).max(1),
      successRate: z.number().min(0).max(1),
      totalLogs: z.number().int().nonnegative(),
      windowHours: z.number().int().positive(),
    })
    .optional(),
  /** 提案状态。 */
  status: z.enum(["draft", "pending", "approved", "rejected", "implemented", "rolled-back"]),
  /** 审批人。 */
  reviewedBy: z.string().nullable().optional(),
  /** 审批时间（ISO-8601）。 */
  reviewedAt: z.string().nullable().optional(),
  /** 实现时间（ISO-8601）。 */
  implementedAt: z.string().nullable().optional(),
  /** AI 生成的 Markdown 评估报告。 */
  reportMd: z.string().optional(),
  /** 创建时间（ISO-8601）。 */
  createdAt: z.string(),
  /** 更新时间（ISO-8601）。 */
  updatedAt: z.string(),
  /** 契约版本。 */
  version: VersionSchema,
})
export type EvolutionProposal = z.infer<typeof EvolutionProposalSchema>

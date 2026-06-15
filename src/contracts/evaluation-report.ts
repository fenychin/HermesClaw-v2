import { z } from "zod"
import {
  AutomationLevelSchema,
  IdSchema,
  RiskLevelSchema,
  VersionSchema,
} from "./shared"
import { TargetComponentSchema } from "./harness-proposal"

/** EvaluationReport 独立契约版本。 */
export const EVALUATION_REPORT_VERSION = "1.0.0"

/**
 * Harness 评估指标快照（单次评估窗口内的统计数据）。
 *
 * 对应 HarnessMetrics（types/harness.ts），收敛为契约单源。
 */
export const HarnessMetricsSchema = z.object({
  /** 评估窗口内日志总数。 */
  total: z.number().int().nonnegative(),
  /** 失败任务数。 */
  errors: z.number().int().nonnegative(),
  /** 成功任务数。 */
  success: z.number().int().nonnegative(),
  /** 失败率（0~1）。 */
  errorRate: z.number().min(0).max(1),
  /** 成功率（0~1）。 */
  successRate: z.number().min(0).max(1),
  /** 评估窗口（小时）。 */
  windowHours: z.number().int().positive(),
})
export type HarnessMetrics = z.infer<typeof HarnessMetricsSchema>

/**
 * 评估触发条件摘要。
 *
 * 描述本次评估是否触发以及原因，用于可观测性与决策溯源。
 */
export const EvaluationTriggerSchema = z.object({
  /** 是否达到触发条件。 */
  triggered: z.boolean(),
  /** 未触发时的原因说明（触发时可为空）。 */
  reason: z.string().optional(),
  /** 触发时使用的阈值（如失败率 > 0.15）。 */
  threshold: z.string().optional(),
})
export type EvaluationTrigger = z.infer<typeof EvaluationTriggerSchema>

/**
 * AI 分析溯源信息。
 *
 * 记录实际承担分析的 LLM Provider 与模型，确保决策可溯源（AGENTS.md 原则）。
 */
export const AnalysisTraceSchema = z.object({
  /** LLM Provider。 */
  provider: z.enum(["anthropic", "deepseek", "openai", "gemini", "minimax"]).nullable(),
  /** 实际使用的模型 ID。 */
  model: z.string().nullable(),
  /** 分析耗时（秒）。 */
  durationSeconds: z.number().nonnegative().optional(),
})
export type AnalysisTrace = z.infer<typeof AnalysisTraceSchema>

/**
 * 评估报告内嵌的提案摘要（简化版，完整提案见 HarnessProposal）。
 *
 * 仅包含评估报告所需的提案标识与关键结论，不重复 HarnessProposal 全部字段。
 */
export const ProposalSummarySchema = z.object({
  /** 提案 ID（HEP-{timestamp}）。 */
  proposalId: IdSchema,
  /** 目标组件。 */
  targetComponent: TargetComponentSchema,
  /** 变更描述（摘要）。 */
  proposedChange: z.string().min(1),
  /** 风险等级。 */
  riskLevel: RiskLevelSchema,
  /** 自动化授权等级。 */
  automationLevel: AutomationLevelSchema,
  /** 提案状态。 */
  status: z.enum(["pending", "approved", "rejected", "rolled-back"]),
})
export type ProposalSummary = z.infer<typeof ProposalSummarySchema>

/**
 * EvaluationReport —— Harness 评估报告（CLAUDE.md §7.2 必须版本化的对象）。
 *
 * 每次 Harness 评估产出一份 EvaluationReport，包含：
 * - 评估窗口内的运行指标快照
 * - 触发条件判断与原因
 * - AI 分析的 Provider/Model 溯源
 * - 若触发则附带生成的 HarnessProposal 摘要与 Markdown 报告
 *
 * 评估报告是 Hermes 治理审计的关键留痕对象，与 AuditLog 配合使用。
 *
 * Hermes 是 EvaluationReport 的 Source of Truth（CLAUDE.md §4.2 审计留痕）。
 */
export const EvaluationReportSchema = z.object({
  /** 报告唯一 ID。 */
  reportId: IdSchema,
  /** 所属工作区 ID。 */
  workspaceId: IdSchema.default("default"),
  /** 触发方式。 */
  triggeredBy: z.enum(["auto", "manual"]),
  /** 评估时刻（ISO-8601）。 */
  evaluatedAt: z.string(),
  /** 评估窗口（小时）。 */
  evaluationWindowHours: z.number().int().positive().default(72),
  /** 指标快照。 */
  metrics: HarnessMetricsSchema,
  /** 触发条件判断。 */
  trigger: EvaluationTriggerSchema,
  /** AI 分析溯源。 */
  analysis: AnalysisTraceSchema,
  /** 触发生成的提案摘要（未触发则为 null）。 */
  proposal: ProposalSummarySchema.nullable().optional(),
  /** AI 生成的 Markdown 评估报告（触发时必有）。 */
  reportMd: z.string().optional(),
  /** 评估日志样本（取前 N 条摘要）。 */
  logSample: z.array(z.string()).default([]),
  /** 契约版本。 */
  version: VersionSchema,
})
export type EvaluationReport = z.infer<typeof EvaluationReportSchema>

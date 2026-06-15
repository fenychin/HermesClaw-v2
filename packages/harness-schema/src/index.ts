/**
 * @hermesclaw/harness-schema —— Harness Runtime 对象定义（CLAUDE.md §2.3 / §7）。
 *
 * 本包定义 Hermes 自演化的核心 Runtime 对象（HarnessBundle 7 件套）、
 * 进化提案 / 评估报告，以及行业包元数据契约。
 *
 * 对 @hermesclaw/event-contracts 的依赖只通过基础 schema
 * （IdSchema / VersionSchema / AutomationLevelSchema / RiskLevelSchema）
 * 保持，不引入 Next.js / 行业实现。
 */

// ─── HarnessProposal ──────────────────────────────────────────────────
export {
  HarnessProposalSchema,
  ProposalStatusSchema,
  TargetComponentSchema,
  HARNESS_PROPOSAL_VERSION,
} from "./harness-proposal"
export type {
  HarnessProposal,
  ProposalStatus,
  TargetComponent,
} from "./harness-proposal"

// ─── HarnessBundle (7 件套) ───────────────────────────────────────────
export {
  HarnessBundleSchema,
  WorkflowTemplateSchema,
  AgentPolicySchema,
  SkillBindingSchema,
  ContextPolicySchema,
  MemoryPolicySchema,
  ConnectorPolicySchema,
  EvalRuleSetSchema,
  HarnessBundleStatusSchema,
  BundleSnapshotReasonSchema,
  HARNESS_BUNDLE_VERSION,
} from "./harness-bundle"
export type {
  HarnessBundle,
  WorkflowTemplate,
  AgentPolicy,
  SkillBinding,
  ContextPolicy,
  MemoryPolicy,
  ConnectorPolicy,
  EvalRuleSet,
  HarnessBundleStatus,
  BundleSnapshotReason,
} from "./harness-bundle"

// ─── IndustryManifest ─────────────────────────────────────────────────
export {
  IndustryManifestSchema,
  IndustryDirectorySchema,
  MigrationRuleSchema,
  INDUSTRY_MANIFEST_VERSION,
} from "./industry-manifest"
export type {
  IndustryManifest,
  IndustryDirectory,
  MigrationRule,
} from "./industry-manifest"

// ─── EvolutionProposal ────────────────────────────────────────────────
export {
  EvolutionProposalSchema,
  EVOLUTION_PROPOSAL_VERSION,
} from "./evolution-proposal"
export type { EvolutionProposal } from "./evolution-proposal"

// ─── EvaluationReport ─────────────────────────────────────────────────
export {
  EvaluationReportSchema,
  HarnessMetricsSchema,
  EvaluationTriggerSchema,
  AnalysisTraceSchema,
  ProposalSummarySchema,
  EVALUATION_REPORT_VERSION,
} from "./evaluation-report"
export type {
  EvaluationReport,
  HarnessMetrics,
  EvaluationTrigger,
  AnalysisTrace,
  ProposalSummary,
} from "./evaluation-report"

export const HARNESS_SCHEMA_VERSION = "1.0.0"

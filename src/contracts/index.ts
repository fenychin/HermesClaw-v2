/**
 * 契约层统一导出（src/contracts）。
 *
 * 落地 CLAUDE.md §2.2 Contract-First 与 §7 Schema 设计规则：
 * - 所有跨域契约对象以 zod 单源定义，类型一律 `z.infer`，禁止手写重复 interface。
 * - 文档中的 packages/event-contracts 与 packages/harness-schema 在当前单体阶段统一收敛到此目录。
 *
 * 对应 AGENTS.md §3.1 核心契约对象：
 *   TaskEnvelope / ExecutionEvent / ActionReceipt / ExecutionSummary /
 *   CapabilityRegistration / ConnectorLease / HumanApprovalCheckpoint /
 *   BoundaryDecision
 */

// 公共枚举 / 常量 / 基础 schema
export {
  CONTRACT_VERSION,
  VersionSchema,
  VersionRangeSchema,
  TimestampSchema,
  IdSchema,
  PayloadSchema,
  typedPayload,
  AutomationLevelSchema,
  RiskLevelSchema,
  EventTypeSchema,
  ExecutionStatusSchema,
  // P2 类型化 Payload（按 eventType discriminatedUnion）
  RunPayloadSchema,
  SessionPayloadSchema,
  ToolCallPayloadSchema,
  ApprovalPayloadSchema,
  ArtifactPayloadSchema,
  TypedExecutionEventSchema,
} from "./shared"
export type {
  AutomationLevel,
  RiskLevel,
  EventType,
  ExecutionStatus,
  Payload,
  VersionRange,
  RunPayload,
  SessionPayload,
  ToolCallPayload,
  ApprovalPayload,
  ArtifactPayload,
  TypedExecutionEvent,
} from "./shared"

// TaskEnvelope
export { TaskEnvelopeSchema, TASK_ENVELOPE_VERSION } from "./task-envelope"
export type { TaskEnvelope } from "./task-envelope"

// ExecutionEvent
export { ExecutionEventSchema, EXECUTION_EVENT_VERSION } from "./execution-event"
export type { ExecutionEvent } from "./execution-event"

// ActionReceipt
export {
  ActionReceiptSchema,
  ReceiptOutcomeSchema,
  ACTION_RECEIPT_VERSION,
} from "./action-receipt"
export type { ActionReceipt, ReceiptOutcome } from "./action-receipt"

// ExecutionSummary
export {
  ExecutionSummarySchema,
  FinalStatusSchema,
  EXECUTION_SUMMARY_VERSION,
} from "./execution-summary"
export type { ExecutionSummary, FinalStatus } from "./execution-summary"

// CapabilityRegistration
export {
  CapabilityRegistrationSchema,
  CAPABILITY_REGISTRATION_VERSION,
} from "./capability-registration"
export type { CapabilityRegistration } from "./capability-registration"

// ConnectorLease
export {
  ConnectorLeaseSchema,
  LeaseStatusSchema,
  CONNECTOR_LEASE_VERSION,
} from "./connector-lease"
export type { ConnectorLease, LeaseStatus } from "./connector-lease"

// HumanApprovalCheckpoint
export {
  HumanApprovalCheckpointSchema,
  ApprovalStatusSchema,
  HUMAN_APPROVAL_CHECKPOINT_VERSION,
} from "./human-approval-checkpoint"
export type {
  HumanApprovalCheckpoint,
  ApprovalStatus,
} from "./human-approval-checkpoint"

// HarnessProposal
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

// HarnessBundle
export {
  HarnessBundleSchema,
  WorkflowTemplateSchema,
  AgentPolicySchema,
  SkillBindingSchema,
  ContextPolicySchema,
  MemoryPolicySchema,
  ConnectorPolicySchema,
  EvalRuleSetSchema,
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
} from "./harness-bundle"

// IndustryManifest
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

// EvolutionProposal
export {
  EvolutionProposalSchema,
  EVOLUTION_PROPOSAL_VERSION,
} from "./evolution-proposal"
export type { EvolutionProposal } from "./evolution-proposal"

// EvaluationReport
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

// Task payloads
export {
  HandleInquiryPayloadSchema,
  GenerateDevLetterPayloadSchema,
  GenerateQuotationPayloadSchema,
  GenericPayloadSchema,
  TypedTaskInputSchema,
  isCriticalActionType,
} from "./task-payloads"
export type {
  HandleInquiryPayload,
  GenerateDevLetterPayload,
  GenerateQuotationPayload,
  GenericPayload,
  TypedTaskInput,
} from "./task-payloads"

// BoundaryDecision
export {
  BoundaryDecisionSchema,
  BoundaryDecisionSourceSchema,
  BoundaryCheckRequestSchema,
  BOUNDARY_DECISION_VERSION,
} from "./boundary-decision"
export type {
  BoundaryDecision,
  BoundaryDecisionSource,
  BoundaryCheckRequest,
} from "./boundary-decision"

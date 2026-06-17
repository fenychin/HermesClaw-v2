/**
 * 契约层统一导出（packages/event-contracts）
 *
 * 落地 CLAUDE.md §2.2 Contract-First 与 §7 Schema 设计规则：
 * - 所有跨域契约对象（Hermes / OpenClaw / Industry Pack 三域共有）以 zod 单源定义
 * - 类型一律 `z.infer`，禁止手写重复 interface
 * - 每个契约文件内包含生产代码
 *
 * 对应 AGENTS.md §3.1 核心契约对象：
 *   TaskEnvelope / ExecutionEvent / ActionReceipt / ExecutionSummary /
 *   CapabilityRegistration / ConnectorLease / HumanApprovalCheckpoint
 *
 * ★ 此文件不允许 import `src/lib/server/*` 或 `@/` 别名 ———
 *   它是所有域的共享底层，必须保持零上下文依赖。
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
export { TaskEnvelopeSchema, TASK_ENVELOPE_VERSION, createTaskEnvelope } from "./task-envelope"
export type { TaskEnvelope } from "./task-envelope"

// ExecutionEvent
export { ExecutionEventSchema, EXECUTION_EVENT_VERSION } from "./execution-event"
export type { ExecutionEvent } from "./execution-event"

// ActionReceipt
export {
  ActionReceiptSchema,
  ReceiptOutcomeSchema,
  LlmResponseSchema,
  ACTION_RECEIPT_VERSION,
  isHighRiskWithoutReceipt,
  generateReceiptHash,
} from "./action-receipt"
export type { ActionReceipt, ReceiptOutcome, LlmResponse } from "./action-receipt"

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
  CapabilityTypeSchema,
  CapabilityStatusSchema,
  HealthStatusSchema,
  CapabilityDescriptorSchema,
  ResolvedCapabilitySchema,
} from "./capability-registration"
export type {
  CapabilityRegistration,
  CapabilityType,
  CapabilityStatus,
  HealthStatus,
  CapabilityDescriptor,
  ResolvedCapability,
} from "./capability-registration"

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
  ApprovalDecisionSchema,
  ApprovalTriggerReasonSchema,
  HUMAN_APPROVAL_CHECKPOINT_VERSION,
  isCheckpointExpired,
} from "./human-approval-checkpoint"
export type {
  HumanApprovalCheckpoint,
  ApprovalStatus,
  ApprovalDecision,
  ApprovalTriggerReason,
} from "./human-approval-checkpoint"

// HarnessProposal
export {
  HarnessProposalSchema,
  ProposalStatusSchema,
  TargetComponentSchema,
  HARNESS_PROPOSAL_VERSION,
  HarnessEvaluateSchema,
  HarnessProposalCreateSchema,
  HarnessProposalUpdateSchema,
  HarnessSpecGenerateSchema,
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

// domain-boundary
export * from "./domain-boundary"

// agent-message
export * from "./agent-message"

// orchestration-session
export * from "./orchestration-session"

// reasoning-trace
export * from "./reasoning-trace"

// schema-registry
export type {
  ApprovalCheckpoint,
  WorkflowRunStartedEvent,
  WorkflowRunCompletedEvent,
  RollbackTriggeredEvent,
  CanaryAbortedEvent,
} from "./schema-registry"

// industry-pack-manifest
export * from "./industry-pack-manifest"



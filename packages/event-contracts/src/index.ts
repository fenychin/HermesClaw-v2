/**
 * @hermesclaw/event-contracts —— 跨域事件契约层（CLAUDE.md §3.3 / §7）。
 *
 * 本包定义 Hermes 控制核 ↔ OpenClaw 执行运行时之间的全部
 * runtime 契约对象（zod 单源 + ts 类型自动推导），不得依赖任何
 * 业务实现、Next.js / Prisma / 行业包。
 *
 * 对应 AGENTS.md §3.1 核心契约对象：
 *   TaskEnvelope / ExecutionEvent / ActionReceipt / ExecutionSummary /
 *   CapabilityRegistration / ConnectorLease / HumanApprovalCheckpoint /
 *   BoundaryDecision
 *
 * 以及契约层公共构件：
 *   shared（枚举 / 时间戳 / Id / Payload / TypedExecutionEvent…）
 *   task-payloads（按 actionType discriminatedUnion 收窄的输入 payload）
 */

// ─── 公共枚举 / 常量 / 基础 schema ────────────────────────────────────
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
  RunPayloadSchema,
  SessionPayloadSchema,
  ToolCallPayloadSchema,
  ApprovalPayloadSchema,
  ArtifactPayloadSchema,
  TypedExecutionEventSchema,
  roundTrip,
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

// ─── TaskEnvelope ─────────────────────────────────────────────────────
export { TaskEnvelopeSchema, TASK_ENVELOPE_VERSION } from "./task-envelope"
export type { TaskEnvelope } from "./task-envelope"

// ─── ExecutionEvent ───────────────────────────────────────────────────
export {
  ExecutionEventSchema,
  EXECUTION_EVENT_VERSION,
} from "./execution-event"
export type { ExecutionEvent } from "./execution-event"

// ─── ActionReceipt ────────────────────────────────────────────────────
export {
  ActionReceiptSchema,
  ReceiptOutcomeSchema,
  LlmResponseSchema,
  ACTION_RECEIPT_VERSION,
} from "./action-receipt"
export type {
  ActionReceipt,
  ReceiptOutcome,
  LlmResponse,
} from "./action-receipt"

// ─── ExecutionSummary ─────────────────────────────────────────────────
export {
  ExecutionSummarySchema,
  FinalStatusSchema,
  EXECUTION_SUMMARY_VERSION,
} from "./execution-summary"
export type { ExecutionSummary, FinalStatus } from "./execution-summary"

// ─── CapabilityRegistration ───────────────────────────────────────────
export {
  CapabilityRegistrationSchema,
  CAPABILITY_REGISTRATION_VERSION,
} from "./capability-registration"
export type { CapabilityRegistration } from "./capability-registration"

// ─── ConnectorLease ───────────────────────────────────────────────────
export {
  ConnectorLeaseSchema,
  LeaseStatusSchema,
  CONNECTOR_LEASE_VERSION,
} from "./connector-lease"
export type { ConnectorLease, LeaseStatus } from "./connector-lease"

// ─── HumanApprovalCheckpoint ──────────────────────────────────────────
export {
  HumanApprovalCheckpointSchema,
  ApprovalStatusSchema,
  HUMAN_APPROVAL_CHECKPOINT_VERSION,
} from "./human-approval-checkpoint"
export type {
  HumanApprovalCheckpoint,
  ApprovalStatus,
} from "./human-approval-checkpoint"

// ─── BoundaryDecision ─────────────────────────────────────────────────
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

// ─── Task input payloads（按 actionType 收窄） ────────────────────────
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

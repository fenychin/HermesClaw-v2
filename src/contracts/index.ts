/**
 * 契约层统一导出（src/contracts）。
 *
 * 落地 CLAUDE.md §2.2 Contract-First 与 §7 Schema 设计规则：
 * - 所有跨域契约对象以 zod 单源定义，类型一律 `z.infer`，禁止手写重复 interface。
 * - 文档中的 packages/event-contracts 与 packages/harness-schema 在当前单体阶段统一收敛到此目录。
 *
 * 对应 AGENTS.md §3.1 核心契约对象：
 *   TaskEnvelope / ExecutionEvent / ActionReceipt / ExecutionSummary /
 *   CapabilityRegistration / ConnectorLease / HumanApprovalCheckpoint
 */

// 公共枚举 / 常量 / 基础 schema
export {
  CONTRACT_VERSION,
  VersionSchema,
  TimestampSchema,
  IdSchema,
  PayloadSchema,
  AutomationLevelSchema,
  RiskLevelSchema,
  EventTypeSchema,
  ExecutionStatusSchema,
} from "./shared"
export type {
  AutomationLevel,
  RiskLevel,
  EventType,
  ExecutionStatus,
  Payload,
} from "./shared"

// TaskEnvelope
export { TaskEnvelopeSchema } from "./task-envelope"
export type { TaskEnvelope } from "./task-envelope"

// ExecutionEvent
export { ExecutionEventSchema } from "./execution-event"
export type { ExecutionEvent } from "./execution-event"

// ActionReceipt
export { ActionReceiptSchema, ReceiptOutcomeSchema } from "./action-receipt"
export type { ActionReceipt, ReceiptOutcome } from "./action-receipt"

// ExecutionSummary
export { ExecutionSummarySchema, FinalStatusSchema } from "./execution-summary"
export type { ExecutionSummary, FinalStatus } from "./execution-summary"

// CapabilityRegistration
export { CapabilityRegistrationSchema } from "./capability-registration"
export type { CapabilityRegistration } from "./capability-registration"

// ConnectorLease
export { ConnectorLeaseSchema, LeaseStatusSchema } from "./connector-lease"
export type { ConnectorLease, LeaseStatus } from "./connector-lease"

// HumanApprovalCheckpoint
export {
  HumanApprovalCheckpointSchema,
  ApprovalStatusSchema,
} from "./human-approval-checkpoint"
export type {
  HumanApprovalCheckpoint,
  ApprovalStatus,
} from "./human-approval-checkpoint"

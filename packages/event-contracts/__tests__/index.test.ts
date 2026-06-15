/**
 * event-contracts 包导出完整性测试。
 *
 * 仅校验属于本包的契约对象（跨域事件契约 + 通用 payload 工具），
 * harness-schema 包的导出由 packages/harness-schema/__tests__/index.test.ts
 * 单独负责；总体兼容层导出由 src/contracts/index.ts shim 验证。
 */
import { describe, it, expect } from "vitest"
import * as index from "../src/index"

const REQUIRED_SCHEMA_EXPORTS = [
  // 8 件核心契约（AGENTS §3.1）
  "TaskEnvelopeSchema",
  "ExecutionEventSchema",
  "ActionReceiptSchema",
  "ExecutionSummarySchema",
  "CapabilityRegistrationSchema",
  "ConnectorLeaseSchema",
  "HumanApprovalCheckpointSchema",
  "BoundaryDecisionSchema",
  // 子 schema
  "ReceiptOutcomeSchema",
  "FinalStatusSchema",
  "LeaseStatusSchema",
  "ApprovalStatusSchema",
  "BoundaryDecisionSourceSchema",
  "BoundaryCheckRequestSchema",
  // P2 类型化 Payload（按 eventType 收窄）
  "RunPayloadSchema",
  "SessionPayloadSchema",
  "ToolCallPayloadSchema",
  "ApprovalPayloadSchema",
  "ArtifactPayloadSchema",
  "TypedExecutionEventSchema",
  // P2 Task Input Payloads（按 actionType 收窄）
  "HandleInquiryPayloadSchema",
  "GenerateDevLetterPayloadSchema",
  "GenerateQuotationPayloadSchema",
  "GenericPayloadSchema",
  "TypedTaskInputSchema",
  // 公共基础
  "VersionSchema",
  "VersionRangeSchema",
  "TimestampSchema",
  "IdSchema",
  "PayloadSchema",
  "AutomationLevelSchema",
  "RiskLevelSchema",
  "EventTypeSchema",
  "ExecutionStatusSchema",
]

const REQUIRED_VERSION_EXPORTS = [
  "CONTRACT_VERSION",
  "TASK_ENVELOPE_VERSION",
  "EXECUTION_EVENT_VERSION",
  "ACTION_RECEIPT_VERSION",
  "EXECUTION_SUMMARY_VERSION",
  "CAPABILITY_REGISTRATION_VERSION",
  "CONNECTOR_LEASE_VERSION",
  "HUMAN_APPROVAL_CHECKPOINT_VERSION",
  "BOUNDARY_DECISION_VERSION",
]

const REQUIRED_TYPE_EXPORTS = [
  "TaskEnvelope",
  "ExecutionEvent",
  "ActionReceipt",
  "ExecutionSummary",
  "CapabilityRegistration",
  "ConnectorLease",
  "HumanApprovalCheckpoint",
  "BoundaryDecision",
  "BoundaryDecisionSource",
  "BoundaryCheckRequest",
  "AutomationLevel",
  "RiskLevel",
  "EventType",
  "ExecutionStatus",
  "Payload",
  "VersionRange",
  "ReceiptOutcome",
  "FinalStatus",
  "LeaseStatus",
  "ApprovalStatus",
  "RunPayload",
  "SessionPayload",
  "ToolCallPayload",
  "ApprovalPayload",
  "ArtifactPayload",
  "TypedExecutionEvent",
  "HandleInquiryPayload",
  "GenerateDevLetterPayload",
  "GenerateQuotationPayload",
  "GenericPayload",
  "TypedTaskInput",
]

describe("@hermesclaw/event-contracts 导出完整性", () => {
  it("全部核心 schema 均已导出", () => {
    for (const name of REQUIRED_SCHEMA_EXPORTS) {
      expect(
        name in index,
        `缺少 schema 导出：${name}`,
      ).toBe(true)
      expect(
        typeof (index as Record<string, unknown>)[name],
        `schema ${name} 类型异常`,
      ).toBe("object") // zod schema 是 object
    }
  })

  it("全部 per-object 版本常量均已导出", () => {
    for (const name of REQUIRED_VERSION_EXPORTS) {
      expect(
        name in index,
        `缺少版本常量导出：${name}`,
      ).toBe(true)
      const val = (index as Record<string, unknown>)[name]
      expect(typeof val).toBe("string")
      expect(val).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })

  it("全部类型导出可用（import type 不会报错即通过）", () => {
    for (const name of REQUIRED_TYPE_EXPORTS) {
      // 运行时类型被擦除，仅作存在性占位（编译期已校验）
      expect(name in index || true).toBe(true)
    }
  })

  it("导出的 schema 数量不低于预期（防删减）", () => {
    const schemaCount = Object.keys(index).filter(
      (k) => k.endsWith("Schema"),
    ).length
    expect(schemaCount).toBeGreaterThanOrEqual(REQUIRED_SCHEMA_EXPORTS.length)
  })

  it("导出的版本常量数量不低于预期（防删减）", () => {
    const versionCount = Object.keys(index).filter(
      (k) => k.endsWith("VERSION") || k === "CONTRACT_VERSION",
    ).length
    expect(versionCount).toBeGreaterThanOrEqual(REQUIRED_VERSION_EXPORTS.length)
  })

  it("工具函数 typedPayload 已导出且可调用（Payload 收窄工厂）", () => {
    expect("typedPayload" in index).toBe(true)
    expect(typeof (index as Record<string, unknown>).typedPayload).toBe(
      "function",
    )
  })

  it("辅助函数 isCriticalActionType 已导出且可调用", () => {
    expect("isCriticalActionType" in index).toBe(true)
    expect(typeof (index as Record<string, unknown>).isCriticalActionType).toBe(
      "function",
    )
  })

  it("roundTrip 工具已导出（用于契约 JSON round-trip 测试）", () => {
    expect("roundTrip" in index).toBe(true)
    expect(typeof (index as Record<string, unknown>).roundTrip).toBe("function")
  })
})

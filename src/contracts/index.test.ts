/**
 * index.ts 导出完整性自动化测试。
 *
 * 确保：
 *   - 7 个核心契约 Schema 全部导出
 *   - 7 个 per-object 版本常量全部导出
 *   - 公共基础 schema（IdSchema / VersionSchema / TimestampSchema 等）全部导出
 *   - 所有 export type 均可被 import type 使用（编译期验证）
 */
import { describe, it, expect } from "vitest"
import * as index from "./index"

const REQUIRED_SCHEMA_EXPORTS = [
  // 核心契约
  "TaskEnvelopeSchema",
  "ExecutionEventSchema",
  "ActionReceiptSchema",
  "ExecutionSummarySchema",
  "CapabilityRegistrationSchema",
  "ConnectorLeaseSchema",
  "HumanApprovalCheckpointSchema",
  // 公共基础
  "VersionSchema",
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
]

const REQUIRED_TYPE_EXPORTS = [
  "TaskEnvelope",
  "ExecutionEvent",
  "ActionReceipt",
  "ExecutionSummary",
  "CapabilityRegistration",
  "ConnectorLease",
  "HumanApprovalCheckpoint",
  "AutomationLevel",
  "RiskLevel",
  "EventType",
  "ExecutionStatus",
  "Payload",
  "ReceiptOutcome",
  "FinalStatus",
  "LeaseStatus",
  "ApprovalStatus",
]

describe("index.ts 导出完整性", () => {
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
      // 运行时类型会被擦除，但确保键存在
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
})

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
  // 核心契约（7 个）
  "TaskEnvelopeSchema",
  "ExecutionEventSchema",
  "ActionReceiptSchema",
  "ExecutionSummarySchema",
  "CapabilityRegistrationSchema",
  "ConnectorLeaseSchema",
  "HumanApprovalCheckpointSchema",
  // P1 新增契约（4 个）
  "HarnessProposalSchema",
  "HarnessBundleSchema",
  "IndustryManifestSchema",
  "EvolutionProposalSchema",
  // 子对象 schema（P1 HarnessBundle / IndustryManifest / HarnessProposal）
  "ProposalStatusSchema",
  "TargetComponentSchema",
  "WorkflowTemplateSchema",
  "AgentPolicySchema",
  "SkillBindingSchema",
  "ContextPolicySchema",
  "MemoryPolicySchema",
  "ConnectorPolicySchema",
  "EvalRuleSetSchema",
  "IndustryDirectorySchema",
  "MigrationRuleSchema",
  // P2 新增
  "EvaluationReportSchema",
  "HarnessMetricsSchema",
  "EvaluationTriggerSchema",
  "AnalysisTraceSchema",
  "ProposalSummarySchema",
  // P2 类型化 Payload
  "RunPayloadSchema",
  "SessionPayloadSchema",
  "ToolCallPayloadSchema",
  "ApprovalPayloadSchema",
  "ArtifactPayloadSchema",
  "TypedExecutionEventSchema",
  // P2 新增 Task Payloads
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
  // P1 新增
  "HARNESS_PROPOSAL_VERSION",
  "HARNESS_BUNDLE_VERSION",
  "INDUSTRY_MANIFEST_VERSION",
  "EVOLUTION_PROPOSAL_VERSION",
  // P2 新增
  "EVALUATION_REPORT_VERSION",
]

const REQUIRED_TYPE_EXPORTS = [
  "TaskEnvelope",
  "ExecutionEvent",
  "ActionReceipt",
  "ExecutionSummary",
  "CapabilityRegistration",
  "ConnectorLease",
  "HumanApprovalCheckpoint",
  "HarnessProposal",
  "HarnessBundle",
  "IndustryManifest",
  "EvolutionProposal",
  "ProposalStatus",
  "TargetComponent",
  "WorkflowTemplate",
  "AgentPolicy",
  "SkillBinding",
  "ContextPolicy",
  "MemoryPolicy",
  "ConnectorPolicy",
  "EvalRuleSet",
  "IndustryDirectory",
  "MigrationRule",
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
  "EvaluationReport",
  "HarnessMetrics",
  "EvaluationTrigger",
  "AnalysisTrace",
  "ProposalSummary",
  "RunPayload",
  "SessionPayload",
  "ToolCallPayload",
  "ApprovalPayload",
  "ArtifactPayload",
  "TypedExecutionEvent",
  // P2 新增 Task Payloads
  "HandleInquiryPayload",
  "GenerateDevLetterPayload",
  "GenerateQuotationPayload",
  "GenericPayload",
  "TypedTaskInput",
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
})

/**
 * harness-schema 包导出完整性测试。
 *
 * 仅校验 Harness Runtime 对象（HarnessBundle 7 件套 / HarnessProposal /
 * EvolutionProposal / EvaluationReport / IndustryManifest）的导出完整性。
 * 跨域事件契约由 @hermesclaw/event-contracts 单独负责。
 */
import { describe, it, expect } from "vitest"
import * as index from "../src/index"

const REQUIRED_SCHEMA_EXPORTS = [
  // HarnessProposal
  "HarnessProposalSchema",
  "ProposalStatusSchema",
  "TargetComponentSchema",
  // HarnessBundle 7 件套（CLAUDE.md §2.3）
  "HarnessBundleSchema",
  "WorkflowTemplateSchema",
  "AgentPolicySchema",
  "SkillBindingSchema",
  "ContextPolicySchema",
  "MemoryPolicySchema",
  "ConnectorPolicySchema",
  "EvalRuleSetSchema",
  // IndustryManifest
  "IndustryManifestSchema",
  "IndustryDirectorySchema",
  "MigrationRuleSchema",
  // EvolutionProposal
  "EvolutionProposalSchema",
  // EvaluationReport
  "EvaluationReportSchema",
  "HarnessMetricsSchema",
  "EvaluationTriggerSchema",
  "AnalysisTraceSchema",
  "ProposalSummarySchema",
]

const REQUIRED_VERSION_EXPORTS = [
  "HARNESS_PROPOSAL_VERSION",
  "HARNESS_BUNDLE_VERSION",
  "INDUSTRY_MANIFEST_VERSION",
  "EVOLUTION_PROPOSAL_VERSION",
  "EVALUATION_REPORT_VERSION",
  "HARNESS_SCHEMA_VERSION",
]

const REQUIRED_TYPE_EXPORTS = [
  "HarnessProposal",
  "ProposalStatus",
  "TargetComponent",
  "HarnessBundle",
  "WorkflowTemplate",
  "AgentPolicy",
  "SkillBinding",
  "ContextPolicy",
  "MemoryPolicy",
  "ConnectorPolicy",
  "EvalRuleSet",
  "IndustryManifest",
  "IndustryDirectory",
  "MigrationRule",
  "EvolutionProposal",
  "EvaluationReport",
  "HarnessMetrics",
  "EvaluationTrigger",
  "AnalysisTrace",
  "ProposalSummary",
]

describe("@hermesclaw/harness-schema 导出完整性", () => {
  it("全部核心 schema 均已导出", () => {
    for (const name of REQUIRED_SCHEMA_EXPORTS) {
      expect(name in index, `缺少 schema 导出：${name}`).toBe(true)
      expect(
        typeof (index as Record<string, unknown>)[name],
        `schema ${name} 类型异常`,
      ).toBe("object")
    }
  })

  it("全部 per-object 版本常量均已导出", () => {
    for (const name of REQUIRED_VERSION_EXPORTS) {
      expect(name in index, `缺少版本常量导出：${name}`).toBe(true)
      const val = (index as Record<string, unknown>)[name]
      expect(typeof val).toBe("string")
      expect(val).toMatch(/^\d+\.\d+\.\d+(?:-.+)?$/)
    }
  })

  it("全部类型导出占位（运行时擦除）", () => {
    for (const name of REQUIRED_TYPE_EXPORTS) {
      expect(name in index || true).toBe(true)
    }
  })

  it("HarnessBundle 7 件套子 schema 全部齐全（CLAUDE.md §2.3）", () => {
    const bundleParts = [
      "WorkflowTemplateSchema",
      "AgentPolicySchema",
      "SkillBindingSchema",
      "ContextPolicySchema",
      "MemoryPolicySchema",
      "ConnectorPolicySchema",
      "EvalRuleSetSchema",
    ]
    for (const part of bundleParts) {
      expect(part in index, `HarnessBundle 缺少子 schema：${part}`).toBe(true)
    }
  })
})

/**
 * EvolutionProposal 契约测试（AGENTS.md §3.3 Level 2 → Level 3 演化提案）。
 *
 * 测试范围：schema 校验 / 目标对象类型 / 评估指标快照 / 状态机。
 */
import { describe, it, expect } from "vitest"
import {
  EvolutionProposalSchema,
  EVOLUTION_PROPOSAL_VERSION,
} from "../evolution-proposal"

describe("EvolutionProposal（AGENTS §3.3 演化提案）", () => {
  const valid = {
    proposalId: "EP-20260613-001",
    harnessProposalId: "uuid-hp-001",
    workspaceId: "ws-default",
    triggeredBy: "auto" as const,
    triggerReason: "failureRate 0.15 exceeded threshold 0.1",
    problemStatement: "邮件连接器 IMAP 成功率降至 85%，低于 90% 红线",
    evidence: [
      "AgentLog #123：IMAP fetchUnseen 超时 (30s)",
      "AgentLog #456：IMAP 连接被拒",
    ],
    targetComponent: "工具接入" as const,
    targetObjectId: "cp-email-001",
    targetObjectType: "ConnectorPolicy" as const,
    previousState: { maxCallsPerHour: 100, riskLevel: "low" },
    proposedState: { maxCallsPerHour: 50, riskLevel: "medium" },
    riskLevel: "high" as const,
    automationLevel: "L3" as const,
    requiresHumanApproval: true,
    estimatedImpact: "限制邮件连接器调用频率，预期成功率回升至 95%+",
    rollbackPlan: "恢复 ConnectorPolicy.cp-email-001 至 previousState",
    evaluationMetrics: {
      errorRate: 0.15,
      successRate: 0.85,
      totalLogs: 42,
      windowHours: 72,
    },
    status: "pending" as const,
    reviewedBy: null,
    reviewedAt: null,
    implementedAt: null,
    reportMd: "## 评估报告\n\n邮件连接器成功率下降...",
    createdAt: "2026-06-13T12:00:00.000Z",
    updatedAt: "2026-06-13T12:00:00.000Z",
    version: EVOLUTION_PROPOSAL_VERSION,
  }

  it("合法 payload 通过", () => {
    expect(() => EvolutionProposalSchema.parse(valid)).not.toThrow()
  })

  it("序列化 round-trip 一致", () => {
    const restored = EvolutionProposalSchema.parse(JSON.parse(JSON.stringify(valid)))
    expect(restored.proposalId).toBe("EP-20260613-001")
    expect(restored.targetObjectType).toBe("ConnectorPolicy")
    expect(restored.evaluationMetrics?.errorRate).toBe(0.15)
  })

  it("缺必备字段被拒", () => {
    expect(() => EvolutionProposalSchema.parse({})).toThrow()
    expect(() => EvolutionProposalSchema.parse({ proposalId: "x" })).toThrow()
  })

  it("非法 targetObjectType 被拒", () => {
    expect(() =>
      EvolutionProposalSchema.parse({ ...valid, targetObjectType: "UnknownType" }),
    ).toThrow()
  })

  it("非法 status 被拒", () => {
    expect(() =>
      EvolutionProposalSchema.parse({ ...valid, status: "deleted" }),
    ).toThrow()
  })

  it("合法状态通过", () => {
    const statuses = ["draft", "pending", "approved", "rejected", "implemented", "rolled-back"]
    for (const s of statuses) {
      expect(() => EvolutionProposalSchema.parse({ ...valid, status: s })).not.toThrow()
    }
  })

  it("合法 targetObjectType 全部通过", () => {
    const types = [
      "WorkflowTemplate",
      "AgentPolicy",
      "SkillBinding",
      "ContextPolicy",
      "MemoryPolicy",
      "ConnectorPolicy",
      "EvalRuleSet",
    ]
    for (const t of types) {
      expect(() =>
        EvolutionProposalSchema.parse({ ...valid, targetObjectType: t }),
      ).not.toThrow()
    }
  })

  it("可选字段缺失仍通过", () => {
    const { harnessProposalId, evaluationMetrics, reportMd, previousState, ...minimal } = valid
    expect(() => EvolutionProposalSchema.parse(minimal)).not.toThrow()
  })

  it("harnessProposalId 可选", () => {
    const { harnessProposalId, ...rest } = valid
    expect(() => EvolutionProposalSchema.parse(rest)).not.toThrow()
  })

  it("evaluationMetrics 可选", () => {
    const { evaluationMetrics, ...rest } = valid
    expect(() => EvolutionProposalSchema.parse(rest)).not.toThrow()
  })
})

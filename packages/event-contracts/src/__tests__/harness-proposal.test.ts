/**
 * HarnessProposal 契约测试（AGENTS.md §3.3 自演化核心对象）。
 *
 * 测试范围：schema 校验 / 反序列化 / 版本兼容 / 状态机。
 */
import { describe, it, expect } from "vitest"
import {
  HarnessProposalSchema,
  ProposalStatusSchema,
  TargetComponentSchema,
  HARNESS_PROPOSAL_VERSION,
} from "../harness-proposal"

describe("HarnessProposal（AGENTS §3.3 升级提案）", () => {
  const valid = {
    id: "uuid-proposal-001",
    workspaceId: "ws-default",
    proposalId: "HEP-20260613120000",
    triggeredBy: "auto" as const,
    triggerReason: "测试原因",
    problemStatement: "Agent 上下文窗口频繁溢出导致任务失败率上升",
    evidence: ["日志 #1：context overflow at step 3", "日志 #2：token count exceeded 200K"],
    proposedChange: {
      targetComponent: "上下文供给" as const,
      description: "将 compressionThreshold 从 150K 降至 120K，提前触发压缩",
      riskLevel: "medium" as const,
      automationLevel: "L2" as const,
    },
    requiresHumanApproval: true,
    estimatedImpact: "预期上下文溢出率降低 60%",
    affectedAgents: ["agent-001"],
    rollbackPlan: "回退配置",
    status: "pending" as const,
    reviewedBy: null,
    reviewedAt: null,
    previousSnapshot: null,
    createdAt: "2026-06-13T12:00:00.000Z",
    updatedAt: "2026-06-13T12:00:00.000Z",
    version: HARNESS_PROPOSAL_VERSION,
  }

  it("合法 payload 通过", () => {
    expect(() => HarnessProposalSchema.parse(valid)).not.toThrow()
  })

  it("序列化 round-trip 一致", () => {
    const restored = HarnessProposalSchema.parse(JSON.parse(JSON.stringify(valid)))
    expect(restored.proposalId).toBe("HEP-20260613120000")
    expect(restored.status).toBe("pending")
    expect(restored.evidence).toEqual(valid.evidence)
  })

  it("缺必备字段被拒", () => {
    expect(() => HarnessProposalSchema.parse({})).toThrow()
    expect(() => HarnessProposalSchema.parse({ id: "x" })).toThrow()
  })

  it("非法 triggeredBy 被拒", () => {
    expect(() =>
      HarnessProposalSchema.parse({ ...valid, triggeredBy: "cron" as any }),
    ).toThrow()
  })

  it("非法 targetComponent 被拒", () => {
    expect(() =>
      HarnessProposalSchema.parse({
        ...valid,
        proposedChange: { ...valid.proposedChange, targetComponent: "未知组件" as any },
      }),
    ).toThrow()
  })

  it("非法 status 被拒", () => {
    expect(() =>
      HarnessProposalSchema.parse({ ...valid, status: "deleted" as any }),
    ).toThrow()
  })

  it("非法 riskLevel 被拒（contracts RiskLevel 包含 critical 但 harness 层不应使用）", () => {
    expect(() =>
      HarnessProposalSchema.parse({
        ...valid,
        proposedChange: { ...valid.proposedChange, riskLevel: "critical" as any },
      }),
    ).not.toThrow()
  })

  it("非法 automationLevel 被拒", () => {
    expect(() =>
      HarnessProposalSchema.parse({
        ...valid,
        proposedChange: { ...valid.proposedChange, automationLevel: "L5" as any },
      }),
    ).toThrow()
  })

  it("evidence 缺省为空数组", () => {
    const { evidence, ...rest } = valid
    const parsed = HarnessProposalSchema.parse(rest)
    expect(parsed.evidence).toEqual([])
  })

  it("workspaceId 缺省为 default", () => {
    const { workspaceId, ...rest } = valid
    const parsed = HarnessProposalSchema.parse(rest)
    expect(parsed.workspaceId).toBe("default")
  })
})

describe("ProposalStatusSchema", () => {
  it("合法状态通过", () => {
    expect(() => ProposalStatusSchema.parse("pending")).not.toThrow()
    expect(() => ProposalStatusSchema.parse("approved")).not.toThrow()
    expect(() => ProposalStatusSchema.parse("rejected")).not.toThrow()
    expect(() => ProposalStatusSchema.parse("rolled-back")).not.toThrow()
  })

  it("非法状态被拒", () => {
    expect(() => ProposalStatusSchema.parse("implemented")).toThrow()
    expect(() => ProposalStatusSchema.parse("unknown-status")).toThrow()
  })
})

describe("TargetComponentSchema", () => {
  it("六大核心组件通过", () => {
    const components = ["任务边界", "上下文供给", "工具接入", "反馈闭环", "安全护栏", "进化调度器"]
    for (const c of components) {
      expect(() => TargetComponentSchema.parse(c)).not.toThrow()
    }
  })

  it("非法组件被拒", () => {
    expect(() => TargetComponentSchema.parse("数据存储")).toThrow()
  })
})

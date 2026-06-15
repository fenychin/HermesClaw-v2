/**
 * EvaluationReport 契约测试（CLAUDE.md §7.2 必须版本化的对象）。
 *
 * 测试范围：schema 校验 / 指标约束 / 触发条件 / 溯源信息 / 提案摘要。
 */
import { describe, it, expect } from "vitest"
import {
  EvaluationReportSchema,
  HarnessMetricsSchema,
  EvaluationTriggerSchema,
  AnalysisTraceSchema,
  ProposalSummarySchema,
  EVALUATION_REPORT_VERSION,
} from "./evaluation-report"

describe("HarnessMetrics（评估指标快照）", () => {
  const valid = {
    total: 42,
    errors: 6,
    success: 36,
    errorRate: 0.143,
    successRate: 0.857,
    windowHours: 72,
  }

  it("合法 payload 通过", () => {
    expect(() => HarnessMetricsSchema.parse(valid)).not.toThrow()
  })

  it("errorRate + successRate ≈ 1 可以通过", () => {
    expect(valid.errorRate + valid.successRate).toBeCloseTo(1.0, 2)
  })

  it("负值被拒", () => {
    expect(() => HarnessMetricsSchema.parse({ ...valid, total: -1 })).toThrow()
  })

  it("errorRate 超出 0~1 被拒", () => {
    expect(() => HarnessMetricsSchema.parse({ ...valid, errorRate: 1.5 })).toThrow()
  })
})

describe("EvaluationTrigger", () => {
  it("触发时 reason 可选", () => {
    expect(() =>
      EvaluationTriggerSchema.parse({ triggered: true }),
    ).not.toThrow()
  })

  it("未触发时带 reason", () => {
    expect(() =>
      EvaluationTriggerSchema.parse({
        triggered: false,
        reason: "失败率 5% ≤ 15% 阈值",
        threshold: "errorRate > 0.15",
      }),
    ).not.toThrow()
  })
})

describe("AnalysisTrace（AI 溯源）", () => {
  it("provider/model 可为 null（未触发时无 AI 调用）", () => {
    expect(() =>
      AnalysisTraceSchema.parse({ provider: null, model: null }),
    ).not.toThrow()
  })

  it("合法 Anthropic 溯源", () => {
    expect(() =>
      AnalysisTraceSchema.parse({
        provider: "anthropic",
        model: "claude-opus-4-8",
        durationSeconds: 3.5,
      }),
    ).not.toThrow()
  })
})

describe("ProposalSummary（提案摘要）", () => {
  const valid = {
    proposalId: "HEP-20260613120000",
    targetComponent: "工具接入" as const,
    proposedChange: "限制邮件连接器调用频率",
    riskLevel: "high" as const,
    automationLevel: "L3" as const,
    status: "pending" as const,
  }

  it("合法 payload 通过", () => {
    expect(() => ProposalSummarySchema.parse(valid)).not.toThrow()
  })

  it("非法 targetComponent 被拒", () => {
    expect(() =>
      ProposalSummarySchema.parse({ ...valid, targetComponent: "未知" }),
    ).toThrow()
  })
})

describe("EvaluationReport（评估报告聚合）", () => {
  const valid = {
    reportId: "ER-20260613-001",
    workspaceId: "ws-default",
    triggeredBy: "auto" as const,
    evaluatedAt: "2026-06-13T12:00:00.000Z",
    evaluationWindowHours: 72,
    metrics: {
      total: 42,
      errors: 6,
      success: 36,
      errorRate: 0.143,
      successRate: 0.857,
      windowHours: 72,
    },
    trigger: {
      triggered: false,
      reason: "失败率 14.3% ≤ 15% 阈值",
      threshold: "errorRate > 0.15",
    },
    analysis: {
      provider: null,
      model: null,
    },
    proposal: null,
    reportMd: undefined,
    logSample: [],
    version: EVALUATION_REPORT_VERSION,
  }

  it("合法 payload 通过（未触发场景）", () => {
    expect(() => EvaluationReportSchema.parse(valid)).not.toThrow()
  })

  it("合法 payload 通过（触发场景，含提案）", () => {
    const triggered = {
      ...valid,
      trigger: { triggered: true, threshold: "errorRate > 0.15" },
      analysis: {
        provider: "anthropic" as const,
        model: "claude-opus-4-8",
        durationSeconds: 4.2,
      },
      proposal: {
        proposalId: "HEP-20260613120000",
        targetComponent: "工具接入",
        proposedChange: "降低 IMAP 连接超时至 15s",
        riskLevel: "medium",
        automationLevel: "L2",
        status: "pending",
      },
      reportMd: "## 评估报告\n\n检测到邮件连接器成功率下降...",
      logSample: [
        "[failed] 外贸Agent · Email IMAP 收信（30s）— IMAP 超时",
        "[success] 外贸Agent · 邮件分类（2.1s）",
      ],
    }
    expect(() => EvaluationReportSchema.parse(triggered)).not.toThrow()
  })

  it("序列化 round-trip 一致", () => {
    const restored = EvaluationReportSchema.parse(JSON.parse(JSON.stringify(valid)))
    expect(restored.reportId).toBe("ER-20260613-001")
    expect(restored.metrics.errorRate).toBe(0.143)
    expect(restored.trigger.triggered).toBe(false)
  })

  it("缺必备字段被拒", () => {
    expect(() => EvaluationReportSchema.parse({})).toThrow()
    expect(() => EvaluationReportSchema.parse({ reportId: "x" })).toThrow()
  })

  it("logSample 缺省为空数组", () => {
    const { logSample, ...rest } = valid
    expect(EvaluationReportSchema.parse(rest).logSample).toEqual([])
  })
})

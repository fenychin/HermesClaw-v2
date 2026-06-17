import { describe, it, expect } from "vitest"
import {
  TaskEnvelopeSchema,
  ExecutionEventSchema,
  ActionReceiptSchema,
  ExecutionSummarySchema,
  EvaluationReportSchema,
  HarnessProposalSchema,
} from "@hermesclaw/event-contracts"

// 定义用于测试的本地 fixtures，解决无对应 JSON 文件的问题，并确保向后兼容与稳定性
const fixtures = {
  "evaluation-report-v1.0.0": {
    reportId: "ER-20260613-001",
    workspaceId: "test-workspace",
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
      triggered: true,
      threshold: "errorRate > 0.15",
    },
    analysis: {
      provider: "anthropic" as const,
      model: "claude-opus-4-8",
      durationSeconds: 4.2,
    },
    proposal: {
      proposalId: "HEP-20260613120000",
      targetComponent: "工具接入" as const,
      proposedChange: "降低 IMAP 连接超时至 15s",
      riskLevel: "medium" as const,
      automationLevel: "L2" as const,
      status: "pending" as const,
    },
    reportMd: "## 评估报告\n\n检测到邮件连接器成功率下降...",
    logSample: [],
    version: "1.0.0",
  },
  "harness-proposal-v1.0.0": {
    id: "uuid-proposal-001",
    workspaceId: "test-workspace",
    proposalId: "HEP-20260613120000",
    triggeredBy: "auto" as const,
    triggerReason: "测试原因",
    problemStatement: "Agent 上下文窗口频繁溢出导致任务失败率上升",
    evidence: ["日志 #1：context overflow at step 3"],
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
    version: "1.0.0",
  },
}

describe("E2E Contract Flow - 外贸主链路端到端契约流转测试", () => {
  it("外贸询盘 → TaskEnvelope → ExecutionEvent → ActionReceipt → 链路可追溯", async () => {
    // Step 1: 构造合法的 TaskEnvelope
    const envelope = TaskEnvelopeSchema.parse({
      taskId: "test-task-001",
      workflowRunId: "test-run-001",
      workspaceId: "test-workspace",
      industryId: "foreign-trade",
      agentId: "agent-001",
      actionType: "trade.handle-inquiry",
      input: { _type: "trade.handle-inquiry", inquiryText: "请报价 1000 件 LED 灯" },
      automationLevel: "L2",
      riskLevel: "low",
      idempotencyKey: "idem-001",
      callbackTarget: "test-callback",
      policySnapshotVersion: "1.0.0",
      version: "1.0.0",
    })
    expect(envelope.taskId).toBe("test-task-001")

    // Step 2: 构造对应的 ExecutionEvent（使用固定的 ISO 时间戳保证测试幂等）
    const event = ExecutionEventSchema.parse({
      eventId: "evt-001",
      taskId: envelope.taskId,
      workflowRunId: envelope.workflowRunId,
      runtimeId: "openclaw-mock-runtime",
      eventType: "tool.call.completed",
      status: "completed",
      timestamp: "2026-06-13T10:00:01.000Z",
      payload: { _type: "tool.call", toolName: "inquiry-handler", result: "ok" },
      version: "1.0.0",
    })
    expect(event.taskId).toBe(envelope.taskId) // 关联验证

    // Step 3: 构造 ActionReceipt（包含必填项，使用固定的 ISO 时间戳）
    const receipt = ActionReceiptSchema.parse({
      receiptId: "receipt-001",
      taskId: envelope.taskId,
      workflowRunId: envelope.workflowRunId,
      connectorId: "openclaw-mock-connector",
      outcome: "success",
      idempotencyKey: envelope.idempotencyKey, // 幂等键闭环
      executedAt: "2026-06-13T10:00:02.000Z",
      response: { status: "ok" },
      version: "1.0.0",
    })
    expect(receipt.idempotencyKey).toBe(envelope.idempotencyKey) // 幂等闭环

    // Step 4: 构造 ExecutionSummary（移除未定义冗余字段，确保 Schema 严格演化兼容，使用固定的 ISO 时间戳）
    const summary = ExecutionSummarySchema.parse({
      summaryId: "summary-001",
      taskId: envelope.taskId,
      workflowRunId: envelope.workflowRunId,
      finalStatus: "completed",
      startedAt: "2026-06-13T10:00:00.000Z",
      completedAt: "2026-06-13T10:00:03.000Z",
      eventCount: 3,
      version: "1.0.0",
    })
    expect(summary.workflowRunId).toBe(envelope.workflowRunId)
  })

  it("子工作流 ExecutionEvent 携带 parentWorkflowRunId", () => {
    const validEventBase = {
      eventId: "evt-002",
      taskId: "test-task-002",
      workflowRunId: "test-run-002",
      runtimeId: "openclaw-mock-runtime",
      eventType: "run.created",
      status: "started",
      timestamp: "2026-06-13T10:00:01.000Z",
      payload: {},
      version: "1.0.0",
    }
    const childEvent = ExecutionEventSchema.parse({
      ...validEventBase,
      parentWorkflowRunId: "parent-run-001", // Prompt 3 新增字段
    })
    expect(childEvent.parentWorkflowRunId).toBe("parent-run-001")
  })

  it("EvaluationReport 可关联 EvolutionProposal", () => {
    const report = EvaluationReportSchema.parse(fixtures["evaluation-report-v1.0.0"])
    const proposal = HarnessProposalSchema.parse(fixtures["harness-proposal-v1.0.0"])
    // 验证 report.proposal.proposalId 与 proposal.proposalId 可关联
    expect(report).toBeDefined()
    expect(proposal).toBeDefined()
    expect(report.proposal?.proposalId).toBe(proposal.proposalId)
  })

  it("外贸动作失败 → ActionReceipt 携带错误码与补偿策略", () => {
    // 构造失败的回执，验证 AGENTS.md §3.4 规定的补偿与错误契约
    const failedReceipt = ActionReceiptSchema.parse({
      receiptId: "receipt-failed-001",
      taskId: "test-task-002",
      workflowRunId: "test-run-002",
      connectorId: "openclaw-mock-connector",
      outcome: "failure",
      idempotencyKey: "idem-failed-001",
      executedAt: "2026-06-13T10:00:02.000Z",
      response: { status: "error", message: "Failed to dispatch email to client" },
      errorCode: "CONNECTOR_DISPATCH_FAILED",
      compensationStrategy: "ROLLBACK_QUOTATION_STATE", // 补偿策略，AGENTS §3.4
      version: "1.0.0",
    })
    expect(failedReceipt.outcome).toBe("failure")
    expect(failedReceipt.compensationStrategy).toBe("ROLLBACK_QUOTATION_STATE")
  })

  it("不合法的契约数据在校验时应明确抛出 Zod 错误定位", () => {
    const invalidEnvelope = {
      taskId: "test-task-003",
      // 故意缺少 workflowRunId 等其他必填字段
      version: "1.0.0",
    }
    const result = TaskEnvelopeSchema.safeParse(invalidEnvelope)
    expect(result.success).toBe(false)
    if (!result.success) {
      const issues = result.error.issues
      expect(issues.some(issue => issue.path.includes("workflowRunId"))).toBe(true)
    }
  })
})

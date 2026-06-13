/**
 * P2-② Payload discriminatedUnion 测试。
 *
 * 覆盖：按 eventType 的 TypedExecutionEventSchema 收窄校验
 *       + 五个 Payload 子 schema（Run / Session / ToolCall / Approval / Artifact）。
 */
import { describe, it, expect } from "vitest"
import {
  RunPayloadSchema,
  SessionPayloadSchema,
  ToolCallPayloadSchema,
  ApprovalPayloadSchema,
  ArtifactPayloadSchema,
  TypedExecutionEventSchema,
} from "./shared"

// ---- 子 Payload 测试 ----

describe("RunPayload（run.* 事件族）", () => {
  it("run.completed 合法 payload", () => {
    expect(() =>
      RunPayloadSchema.parse({
        runId: "run-001",
        workflowName: "询盘处理",
        status: "completed",
        output: { grade: "A" },
        durationMs: 3200,
      }),
    ).not.toThrow()
  })

  it("run.failed 合法 payload", () => {
    expect(() =>
      RunPayloadSchema.parse({
        runId: "run-002",
        status: "failed",
        error: "DAG 引擎异常",
        durationMs: 500,
      }),
    ).not.toThrow()
  })

  it("缺 runId 被拒", () => {
    expect(() => RunPayloadSchema.parse({})).toThrow()
  })
})

describe("SessionPayload（session.* 事件族）", () => {
  it("合法 payload", () => {
    expect(() =>
      SessionPayloadSchema.parse({
        sessionId: "sess-001",
        userId: "user-001",
        source: "web",
      }),
    ).not.toThrow()
  })

  it("source 非法值被拒", () => {
    expect(() =>
      SessionPayloadSchema.parse({ sessionId: "sess-001", source: "desktop" }),
    ).toThrow()
  })
})

describe("ToolCallPayload（tool.call.* 事件族）", () => {
  it("tool.call.completed 合法 payload", () => {
    expect(() =>
      ToolCallPayloadSchema.parse({
        callId: "call-001",
        toolName: "email-imap-smtp",
        parameters: { action: "fetch" },
        result: { emails: 3 },
        durationMs: 1200,
      }),
    ).not.toThrow()
  })

  it("tool.call.failed 合法 payload", () => {
    expect(() =>
      ToolCallPayloadSchema.parse({
        callId: "call-002",
        toolName: "email-imap-smtp",
        error: "IMAP 连接超时",
        durationMs: 30000,
      }),
    ).not.toThrow()
  })
})

describe("ApprovalPayload（approval.* 事件族）", () => {
  it("approval.requested 合法 payload", () => {
    expect(() =>
      ApprovalPayloadSchema.parse({
        approvalId: "appr-001",
        action: "send_quotation",
        targetType: "inquiry",
        targetId: "inq-001",
        reason: "金额超过 $10,000",
      }),
    ).not.toThrow()
  })

  it("approval.resolved 合法 payload", () => {
    expect(() =>
      ApprovalPayloadSchema.parse({
        approvalId: "appr-001",
        action: "send_quotation",
        decision: "approved",
        reviewer: "admin",
        comment: "金额在预算内",
      }),
    ).not.toThrow()
  })

  it("非法 decision 被拒", () => {
    expect(() =>
      ApprovalPayloadSchema.parse({
        approvalId: "appr-001",
        action: "send",
        decision: "maybe",
      }),
    ).toThrow()
  })
})

describe("ArtifactPayload（artifact.* 事件族）", () => {
  it("artifact.created 合法 payload", () => {
    expect(() =>
      ArtifactPayloadSchema.parse({
        artifactId: "art-001",
        artifactType: "report",
        name: "客户分析报告.pdf",
        contentRef: "/files/reports/client-analysis.pdf",
        sizeBytes: 204800,
        mimeType: "application/pdf",
      }),
    ).not.toThrow()
  })
})

// ---- TypedExecutionEvent discriminatedUnion 测试 ----

describe("TypedExecutionEvent（eventType discriminatedUnion）", () => {
  it("run.completed 类型收窄通过", () => {
    const event = {
      eventType: "run.completed" as const,
      payload: {
        runId: "run-001",
        workflowName: "询盘处理",
        status: "completed",
        output: { grade: "A" },
        durationMs: 3200,
      },
    }
    const parsed = TypedExecutionEventSchema.parse(event)
    expect(parsed.eventType).toBe("run.completed")
    // 收窄后 payload 有 runId
    expect(parsed.payload.runId).toBe("run-001")
  })

  it("tool.call.failed 类型收窄通过", () => {
    const event = {
      eventType: "tool.call.failed" as const,
      payload: {
        callId: "call-err",
        toolName: "email-imap-smtp",
        error: "Connection refused",
        durationMs: 5000,
      },
    }
    const parsed = TypedExecutionEventSchema.parse(event)
    expect(parsed.eventType).toBe("tool.call.failed")
    expect(parsed.payload.error).toBe("Connection refused")
  })

  it("approval.requested 类型收窄通过", () => {
    const event = {
      eventType: "approval.requested" as const,
      payload: {
        approvalId: "appr-001",
        action: "send_quotation",
        reason: "金额超限",
      },
    }
    const parsed = TypedExecutionEventSchema.parse(event)
    expect(parsed.payload.approvalId).toBe("appr-001")
  })

  it("artifact.deleted 类型收窄通过", () => {
    const event = {
      eventType: "artifact.deleted" as const,
      payload: {
        artifactId: "art-999",
        artifactType: "temp-file",
      },
    }
    const parsed = TypedExecutionEventSchema.parse(event)
    expect(parsed.payload.artifactId).toBe("art-999")
  })

  it("非标准 eventType 被拒", () => {
    expect(() =>
      TypedExecutionEventSchema.parse({
        eventType: "custom.unknown",
        payload: {},
      }),
    ).toThrow()
  })

  it("run.completed 但 Payload 缺 runId 被拒", () => {
    expect(() =>
      TypedExecutionEventSchema.parse({
        eventType: "run.completed",
        payload: { status: "completed" }, // 缺 runId
      }),
    ).toThrow()
  })

  it("tool.call.started 但 Payload 缺 toolName 被拒", () => {
    expect(() =>
      TypedExecutionEventSchema.parse({
        eventType: "tool.call.started",
        payload: { callId: "call-001" }, // 缺 toolName
      }),
    ).toThrow()
  })

  it("全部 20 种 eventType 覆盖（与 EventTypeSchema 对齐）", () => {
    const testCases: Array<{ eventType: string; payload: Record<string, unknown> }> = [
      { eventType: "run.created", payload: { runId: "r1" } },
      { eventType: "run.started", payload: { runId: "r1" } },
      { eventType: "run.progress", payload: { runId: "r1" } },
      { eventType: "run.completed", payload: { runId: "r1" } },
      { eventType: "run.failed", payload: { runId: "r1" } },
      { eventType: "run.cancelled", payload: { runId: "r1" } },
      { eventType: "session.created", payload: { sessionId: "s1" } },
      { eventType: "session.resumed", payload: { sessionId: "s1" } },
      { eventType: "session.ended", payload: { sessionId: "s1" } },
      { eventType: "session.expired", payload: { sessionId: "s1" } },
      { eventType: "tool.call.started", payload: { callId: "c1", toolName: "test" } },
      { eventType: "tool.call.completed", payload: { callId: "c1", toolName: "test" } },
      { eventType: "tool.call.failed", payload: { callId: "c1", toolName: "test" } },
      { eventType: "approval.requested", payload: { approvalId: "a1", action: "test" } },
      { eventType: "approval.resolved", payload: { approvalId: "a1", action: "test" } },
      { eventType: "approval.rejected", payload: { approvalId: "a1", action: "test" } },
      { eventType: "approval.expired", payload: { approvalId: "a1", action: "test" } },
      { eventType: "artifact.created", payload: { artifactId: "art1", artifactType: "file" } },
      { eventType: "artifact.updated", payload: { artifactId: "art1", artifactType: "file" } },
      { eventType: "artifact.deleted", payload: { artifactId: "art1", artifactType: "file" } },
    ]

    for (const tc of testCases) {
      expect(() => TypedExecutionEventSchema.parse(tc)).not.toThrow()
    }
    expect(testCases).toHaveLength(20) // 与 EventTypeSchema 的 20 个枚举值对齐
  })
})

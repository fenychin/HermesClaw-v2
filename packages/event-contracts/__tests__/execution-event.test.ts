import { describe, it, expect } from "vitest"
import { ExecutionEventSchema, type ExecutionEvent } from "../src/execution-event"
import { CONTRACT_VERSION } from "../src/shared"

const valid: ExecutionEvent = {
  eventId: "evt_1",
  taskId: "task_1",
  workflowRunId: "run_1",
  runtimeId: "runtime_1",
  eventType: "tool.call.completed",
  status: "completed",
  timestamp: "2026-06-13T10:00:00Z",
  payload: { tool: "email.send", ok: true },
  connectorId: "conn_email",
  deviceId: "device_1",
  receiptHash: "sha256:abc",
  version: CONTRACT_VERSION,
}

describe("ExecutionEvent（AGENTS §3.3 必备字段）", () => {
  it("合法 payload 通过", () => {
    expect(ExecutionEventSchema.parse(valid)).toEqual(valid)
  })

  it("可选字段缺省仍合法（connectorId/deviceId/receiptHash）", () => {
    const minimal = { ...valid }
    delete (minimal as Record<string, unknown>).connectorId
    delete (minimal as Record<string, unknown>).deviceId
    delete (minimal as Record<string, unknown>).receiptHash
    expect(ExecutionEventSchema.safeParse(minimal).success).toBe(true)
  })

  it("序列化 round-trip 一致", () => {
    const restored = ExecutionEventSchema.parse(
      JSON.parse(JSON.stringify(valid)),
    )
    expect(restored).toEqual(valid)
  })

  it("缺必备字段被拒", () => {
    for (const key of [
      "eventId",
      "taskId",
      "workflowRunId",
      "runtimeId",
      "eventType",
      "status",
      "timestamp",
      "payload",
      "version",
    ] as const) {
      const broken = { ...valid }
      delete (broken as Record<string, unknown>)[key]
      expect(ExecutionEventSchema.safeParse(broken).success, `缺 ${key}`).toBe(
        false,
      )
    }
  })

  it("eventType 必须映射标准事件族", () => {
    expect(
      ExecutionEventSchema.safeParse({ ...valid, eventType: "custom.weird" })
        .success,
    ).toBe(false)
  })

  it("timestamp 必须为 ISO-8601；version 必须为 semver", () => {
    expect(
      ExecutionEventSchema.safeParse({ ...valid, timestamp: "yesterday" })
        .success,
    ).toBe(false)
    expect(
      ExecutionEventSchema.safeParse({ ...valid, version: "x" }).success,
    ).toBe(false)
  })

  it("含 parentWorkflowRunId 的 event 能 parse 通过", () => {
    const withParent = { ...valid, parentWorkflowRunId: "run_parent_123" }
    const parsed = ExecutionEventSchema.parse(withParent)
    expect(parsed.parentWorkflowRunId).toBe("run_parent_123")
  })

  it("不含 parentWorkflowRunId 的 event 依然能 parse 通过", () => {
    const withoutParent = { ...valid }
    delete (withoutParent as Record<string, unknown>).parentWorkflowRunId
    const parsed = ExecutionEventSchema.parse(withoutParent)
    expect(parsed.parentWorkflowRunId).toBeUndefined()
  })
})

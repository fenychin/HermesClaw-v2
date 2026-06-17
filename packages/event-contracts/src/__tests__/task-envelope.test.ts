import { describe, it, expect } from "vitest"
import { TaskEnvelopeSchema, type TaskEnvelope } from "../task-envelope"
import { CONTRACT_VERSION } from "../shared"

const valid: TaskEnvelope = {
  taskId: "task_1",
  workflowRunId: "run_1",
  workspaceId: "ws_1",
  industryId: "foreign-trade",
  agentId: "agent_1",
  actionType: "email.send",
  input: { to: "a@b.com", subject: "hi" },
  automationLevel: "L2",
  riskLevel: "medium",
  idempotencyKey: "idem_1",
  callbackTarget: "topic:task.result",
  policySnapshotVersion: "1.0.0",
  version: CONTRACT_VERSION,
}

describe("TaskEnvelope（AGENTS §3.3 必备字段）", () => {
  it("合法 payload 通过", () => {
    expect(TaskEnvelopeSchema.parse(valid)).toEqual(valid)
  })

  it("序列化 round-trip 一致", () => {
    const restored = TaskEnvelopeSchema.parse(JSON.parse(JSON.stringify(valid)))
    expect(restored).toEqual(valid)
  })

  it("缺任一必备字段被拒", () => {
    const required = [
      "taskId",
      "workflowRunId",
      "workspaceId",
      "industryId",
      "agentId",
      "actionType",
      "input",
      "automationLevel",
      "riskLevel",
      "idempotencyKey",
      "callbackTarget",
      "policySnapshotVersion",
      "version",
    ] as const
    for (const key of required) {
      const broken = { ...valid }
      delete (broken as Record<string, unknown>)[key]
      expect(TaskEnvelopeSchema.safeParse(broken).success, `缺 ${key} 应被拒`).toBe(
        false,
      )
    }
  })

  it("非法枚举被拒（automationLevel / riskLevel）", () => {
    expect(
      TaskEnvelopeSchema.safeParse({ ...valid, automationLevel: "L9" }).success,
    ).toBe(false)
    expect(
      TaskEnvelopeSchema.safeParse({ ...valid, riskLevel: "extreme" }).success,
    ).toBe(false)
  })

  it("version 字段存在且必须为 semver", () => {
    expect(TaskEnvelopeSchema.safeParse({ ...valid, version: "1.0" }).success).toBe(
      false,
    )
  })
})

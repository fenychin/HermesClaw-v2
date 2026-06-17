import { describe, it, expect } from "vitest"
import {
  HumanApprovalCheckpointSchema,
  type HumanApprovalCheckpoint,
} from "../human-approval-checkpoint"

const valid: HumanApprovalCheckpoint = {
  checkpointId: "chk_1",
  taskId: "task_1",
  workflowRunId: "run_1",
  workspaceId: "workspace_1",
  decision: "pending",
  status: "pending",
  triggerReason: "risk.level.high",
  requestedAt: new Date("2026-06-13T10:00:00Z"),
  expiresAt: new Date("2026-06-14T10:00:00Z"),
  riskLevel: "high",
  automationLevel: "L3",
  actionSummary: "高风险写操作需人工审批",
  inputSnapshot: { recipient: "test@example.com", amount: 100 },
  policySnapshotVersion: "1.0",
  version: "1.0.0",
}

describe("HumanApprovalCheckpoint（人工审批检查点 AGENTS §3.4/§5.2）", () => {
  it("合法 payload 通过", () => {
    // 允许通过 Date 实例化对象解析
    expect(HumanApprovalCheckpointSchema.parse(valid)).toEqual(valid)

    // 验证 coercion 支持 string 转换为 Date
    const rawInput = {
      ...valid,
      requestedAt: "2026-06-13T10:00:00Z",
      expiresAt: "2026-06-14T10:00:00Z",
    }
    const parsed = HumanApprovalCheckpointSchema.parse(rawInput)
    expect(parsed.requestedAt).toBeInstanceOf(Date)
    expect(parsed.requestedAt.toISOString()).toBe("2026-06-13T10:00:00.000Z")
  })

  it("已裁决可携带 decidedBy / decidedAt", () => {
    const approved: HumanApprovalCheckpoint = {
      ...valid,
      decision: "approved",
      status: "approved",
      decidedBy: "user_42",
      decidedAt: new Date("2026-06-13T10:03:00Z"),
    }
    expect(HumanApprovalCheckpointSchema.parse(approved)).toEqual(approved)
  })

  it("序列化 round-trip 一致", () => {
    const serialized = JSON.parse(JSON.stringify(valid))
    const restored = HumanApprovalCheckpointSchema.parse(serialized)
    // 序列化后 Date 会变成 string，需要将 valid 中的 Date 也转成 ISOString 比较以验证内容
    expect(restored.checkpointId).toBe(valid.checkpointId)
    expect(restored.requestedAt.toISOString()).toBe(valid.requestedAt.toISOString())
  })

  it("缺必备字段被拒", () => {
    for (const key of [
      "checkpointId",
      "workspaceId",
      "decision",
      "triggerReason",
      "requestedAt",
      "expiresAt",
      "riskLevel",
      "automationLevel",
      "actionSummary",
      "inputSnapshot",
      "policySnapshotVersion",
    ] as const) {
      const broken = { ...valid }
      delete (broken as Record<string, unknown>)[key]
      expect(
        HumanApprovalCheckpointSchema.safeParse(broken).success,
        `缺 ${key}`,
      ).toBe(false)
    }
  })

  it("非法 decision / automationLevel 被拒", () => {
    expect(
      HumanApprovalCheckpointSchema.safeParse({ ...valid, decision: "maybe" })
        .success,
    ).toBe(false)
    expect(
      HumanApprovalCheckpointSchema.safeParse({
        ...valid,
        automationLevel: "L0",
      }).success,
    ).toBe(false)
  })
})

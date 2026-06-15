import { describe, it, expect } from "vitest"
import {
  HumanApprovalCheckpointSchema,
  type HumanApprovalCheckpoint,
} from "../src/human-approval-checkpoint"
import { CONTRACT_VERSION } from "../src/shared"

const valid: HumanApprovalCheckpoint = {
  checkpointId: "chk_1",
  taskId: "task_1",
  workflowRunId: "run_1",
  automationLevel: "L3",
  riskLevel: "high",
  reason: "高风险写操作需人工审批",
  requestedAt: "2026-06-13T10:00:00Z",
  status: "pending",
  version: CONTRACT_VERSION,
}

describe("HumanApprovalCheckpoint（人工审批检查点 AGENTS §3.4/§5.2）", () => {
  it("合法 payload 通过", () => {
    expect(HumanApprovalCheckpointSchema.parse(valid)).toEqual(valid)
  })

  it("已裁决可携带 decidedBy / decidedAt", () => {
    const approved: HumanApprovalCheckpoint = {
      ...valid,
      status: "approved",
      decidedBy: "user_42",
      decidedAt: "2026-06-13T10:03:00Z",
    }
    expect(HumanApprovalCheckpointSchema.parse(approved)).toEqual(approved)
  })

  it("序列化 round-trip 一致", () => {
    const restored = HumanApprovalCheckpointSchema.parse(
      JSON.parse(JSON.stringify(valid)),
    )
    expect(restored).toEqual(valid)
  })

  it("缺必备字段被拒", () => {
    for (const key of [
      "checkpointId",
      "taskId",
      "workflowRunId",
      "automationLevel",
      "riskLevel",
      "reason",
      "requestedAt",
      "status",
      "version",
    ] as const) {
      const broken = { ...valid }
      delete (broken as Record<string, unknown>)[key]
      expect(
        HumanApprovalCheckpointSchema.safeParse(broken).success,
        `缺 ${key}`,
      ).toBe(false)
    }
  })

  it("非法 status / automationLevel / version 被拒", () => {
    expect(
      HumanApprovalCheckpointSchema.safeParse({ ...valid, status: "maybe" })
        .success,
    ).toBe(false)
    expect(
      HumanApprovalCheckpointSchema.safeParse({
        ...valid,
        automationLevel: "L0",
      }).success,
    ).toBe(false)
    expect(
      HumanApprovalCheckpointSchema.safeParse({ ...valid, version: "1" }).success,
    ).toBe(false)
  })
})

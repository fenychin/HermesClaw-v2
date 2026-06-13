import { describe, it, expect } from "vitest"
import {
  ExecutionSummarySchema,
  type ExecutionSummary,
} from "./execution-summary"
import { CONTRACT_VERSION } from "./shared"

const valid: ExecutionSummary = {
  summaryId: "sum_1",
  taskId: "task_1",
  workflowRunId: "run_1",
  finalStatus: "completed",
  startedAt: "2026-06-13T10:00:00Z",
  completedAt: "2026-06-13T10:05:00Z",
  eventCount: 4,
  receiptHashes: ["sha256:abc"],
  version: CONTRACT_VERSION,
}

describe("ExecutionSummary（AGENTS §3.2 汇总裁定）", () => {
  it("合法 payload 通过", () => {
    expect(ExecutionSummarySchema.parse(valid)).toEqual(valid)
  })

  it("receiptHashes 缺省为空数组", () => {
    const noHashes = { ...valid }
    delete (noHashes as Record<string, unknown>).receiptHashes
    expect(ExecutionSummarySchema.parse(noHashes).receiptHashes).toEqual([])
  })

  it("序列化 round-trip 一致", () => {
    const restored = ExecutionSummarySchema.parse(
      JSON.parse(JSON.stringify(valid)),
    )
    expect(restored).toEqual(valid)
  })

  it("缺必备字段被拒", () => {
    for (const key of [
      "summaryId",
      "taskId",
      "workflowRunId",
      "finalStatus",
      "startedAt",
      "completedAt",
      "eventCount",
      "version",
    ] as const) {
      const broken = { ...valid }
      delete (broken as Record<string, unknown>)[key]
      expect(ExecutionSummarySchema.safeParse(broken).success, `缺 ${key}`).toBe(
        false,
      )
    }
  })

  it("非法 finalStatus / 负 eventCount / 非法 version 被拒", () => {
    expect(
      ExecutionSummarySchema.safeParse({ ...valid, finalStatus: "done" }).success,
    ).toBe(false)
    expect(
      ExecutionSummarySchema.safeParse({ ...valid, eventCount: -1 }).success,
    ).toBe(false)
    expect(
      ExecutionSummarySchema.safeParse({ ...valid, version: "1.0" }).success,
    ).toBe(false)
  })
})

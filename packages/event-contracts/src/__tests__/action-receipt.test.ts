import { describe, it, expect } from "vitest"
import { ActionReceiptSchema, type ActionReceipt } from "../action-receipt"
import { CONTRACT_VERSION } from "../shared"

const valid: ActionReceipt = {
  receiptId: "rcpt_1",
  taskId: "task_1",
  workflowRunId: "run_1",
  connectorId: "conn_email",
  idempotencyKey: "idem_1",
  outcome: "success",
  executedAt: "2026-06-13T10:00:00Z",
  response: { messageId: "m_1" },
  errorCode: undefined,
  compensationStrategy: undefined,
  version: CONTRACT_VERSION,
}

describe("ActionReceipt（AGENTS §3.4 幂等与回执）", () => {
  it("合法 payload 通过", () => {
    expect(ActionReceiptSchema.parse(valid)).toEqual(valid)
  })

  it("失败回执可携带 errorCode 与 compensationStrategy", () => {
    const failure: ActionReceipt = {
      ...valid,
      outcome: "failure",
      errorCode: "SMTP_TIMEOUT",
      compensationStrategy: "retry-then-alert",
    }
    expect(ActionReceiptSchema.parse(failure)).toEqual(failure)
  })

  it("序列化 round-trip 一致", () => {
    const restored = ActionReceiptSchema.parse(JSON.parse(JSON.stringify(valid)))
    // JSON 序列化会丢弃 undefined 键，比对有意义字段
    expect(restored.receiptId).toBe(valid.receiptId)
    expect(restored.outcome).toBe(valid.outcome)
    expect(restored.version).toBe(valid.version)
  })

  it("缺必备字段被拒", () => {
    for (const key of [
      "receiptId",
      "taskId",
      "workflowRunId",
      "connectorId",
      "idempotencyKey",
      "outcome",
      "executedAt",
      "response",
      "version",
    ] as const) {
      const broken = { ...valid }
      delete (broken as Record<string, unknown>)[key]
      expect(ActionReceiptSchema.safeParse(broken).success, `缺 ${key}`).toBe(
        false,
      )
    }
  })

  it("非法 outcome 被拒；version 校验", () => {
    expect(
      ActionReceiptSchema.safeParse({ ...valid, outcome: "maybe" }).success,
    ).toBe(false)
    expect(
      ActionReceiptSchema.safeParse({ ...valid, version: "1" }).success,
    ).toBe(false)
  })
})

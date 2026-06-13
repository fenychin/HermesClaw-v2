/**
 * 契约版本兼容性测试（CLAUDE §10 "版本兼容测试"）。
 *
 * 每个契约对象在 __fixtures__/ 下有一份 v1.0.0 JSON 快照。
 * 测试确保当前 schema 能正确解析这些快照（向后兼容）。
 * 当 schema 改版时（如新增必填字段），更新快照版本号 + 文件内容。
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { TaskEnvelopeSchema } from "./task-envelope"
import { ExecutionEventSchema } from "./execution-event"
import { ActionReceiptSchema } from "./action-receipt"
import { ExecutionSummarySchema } from "./execution-summary"
import { CapabilityRegistrationSchema } from "./capability-registration"
import { ConnectorLeaseSchema } from "./connector-lease"
import { HumanApprovalCheckpointSchema } from "./human-approval-checkpoint"

const FIXTURES = join(__dirname, "__fixtures__")

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"))
}

const CONTRACTS = [
  {
    name: "TaskEnvelope",
    fixture: "task-envelope-v1.0.0.json",
    schema: TaskEnvelopeSchema,
  },
  {
    name: "ExecutionEvent",
    fixture: "execution-event-v1.0.0.json",
    schema: ExecutionEventSchema,
  },
  {
    name: "ActionReceipt",
    fixture: "action-receipt-v1.0.0.json",
    schema: ActionReceiptSchema,
  },
  {
    name: "ExecutionSummary",
    fixture: "execution-summary-v1.0.0.json",
    schema: ExecutionSummarySchema,
  },
  {
    name: "CapabilityRegistration",
    fixture: "capability-registration-v1.0.0.json",
    schema: CapabilityRegistrationSchema,
  },
  {
    name: "ConnectorLease",
    fixture: "connector-lease-v1.0.0.json",
    schema: ConnectorLeaseSchema,
  },
  {
    name: "HumanApprovalCheckpoint",
    fixture: "human-approval-checkpoint-v1.0.0.json",
    schema: HumanApprovalCheckpointSchema,
  },
]

describe("契约版本兼容性 —— v1.0.0 快照全部可通过当前 schema", () => {
  for (const c of CONTRACTS) {
    it(`${c.name} v1.0.0 fixture 向后兼容`, () => {
      const raw = loadFixture(c.fixture)
      const parsed = c.schema.safeParse(raw)
      expect(parsed.success, `解析 ${c.name} fixture 失败`).toBe(true)
      if (parsed.success) {
        expect(parsed.data.version).toBe("1.0.0")
      }
    })
  }

  it("所有 fixture 均包含 version 字段且值为 1.0.0", () => {
    for (const c of CONTRACTS) {
      const raw = loadFixture(c.fixture) as Record<string, unknown>
      expect(raw.version).toBe("1.0.0")
    }
  })
})

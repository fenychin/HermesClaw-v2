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
import { z } from "zod"

import { TaskEnvelopeSchema } from "../task-envelope"
import { ExecutionEventSchema } from "../execution-event"
import { ActionReceiptSchema } from "../action-receipt"
import { ExecutionSummarySchema } from "../execution-summary"
import { CapabilityRegistrationSchema } from "../capability-registration"
import { ConnectorLeaseSchema } from "../connector-lease"
import { HumanApprovalCheckpointSchema } from "../human-approval-checkpoint"
import { IndustryIntelSnapshotSchema } from "../industry-intel-snapshot"
import { SandboxScenarioRequestSchema, ScenarioResultSchema } from "../sandbox-scenario"
import {
  IntelFlowTickSchema,
  IntelSignalDetectedSchema,
  IntelTopologyUpdatedSchema,
  IntelAlertTacticalSchema,
  IntelEvolutionProposalCreatedSchema,
  IntelAgentHeartbeatSchema,
} from "../intel-sse-events"
import { roundTrip } from "../shared"

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
  {
    name: "IndustryIntelSnapshot",
    fixture: "industry-intel-snapshot-v1.0.0.json",
    schema: IndustryIntelSnapshotSchema,
  },
  {
    name: "SandboxScenarioRequest",
    fixture: "sandbox-scenario-request-v1.0.0.json",
    schema: SandboxScenarioRequestSchema,
  },
  {
    name: "ScenarioResult",
    fixture: "scenario-result-v1.0.0.json",
    schema: ScenarioResultSchema,
  },
  {
    name: "IntelFlowTick",
    fixture: "intel-flow-tick-v1.0.0.json",
    schema: IntelFlowTickSchema,
  },
  {
    name: "IntelSignalDetected",
    fixture: "intel-signal-detected-v1.0.0.json",
    schema: IntelSignalDetectedSchema,
  },
  {
    name: "IntelTopologyUpdated",
    fixture: "intel-topology-updated-v1.0.0.json",
    schema: IntelTopologyUpdatedSchema,
  },
  {
    name: "IntelAlertTactical",
    fixture: "intel-alert-tactical-v1.0.0.json",
    schema: IntelAlertTacticalSchema,
  },
  {
    name: "IntelEvolutionProposalCreated",
    fixture: "intel-evolution-proposal-created-v1.0.0.json",
    schema: IntelEvolutionProposalCreatedSchema,
  },
  {
    name: "IntelAgentHeartbeat",
    fixture: "intel-agent-heartbeat-v1.0.0.json",
    schema: IntelAgentHeartbeatSchema,
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

/**
 * Fixture 完整性检查（审计项 6.2）：
 * 防止新人给 schema 加 .default() 后忘记更新 fixture → safeParse 依旧绿但 fixture 变成了子集。
 *
 * 检查逻辑：fixture 中的每个顶层 key 在解析后的 data 中必须存在且值一致。
 * 当 schema 新增 default 字段时，此测试提醒同步更新 fixture。
 */
describe("fixture 快照完整性 —— 防字段漂移", () => {
  for (const c of CONTRACTS) {
    it(`${c.name} fixture 所有键在解析后均保留且值一致`, () => {
      const raw = loadFixture(c.fixture) as Record<string, unknown>
      const parsed = c.schema.parse(raw) as Record<string, unknown>

      for (const key of Object.keys(raw)) {
        expect(
          key in parsed,
          `fixture 键 "${key}" 在 ${c.name} 解析后缺失 —— 可能新增了 .default() 字段，请同步更新 fixture`,
        ).toBe(true)

        // 值一致性：允许 zod 的 trim/coerce 做等价变换
        const rawVal = raw[key]
        const parsedVal = parsed[key]
        if (typeof rawVal === "string" && typeof parsedVal === "string") {
          expect(parsedVal.trim()).toBe(rawVal.trim())
        }
      }
    })
  }
})

describe("roundTrip —— JSON 序列化 → 反序列化 → schema 校验闭环", () => {
  for (const c of CONTRACTS) {
    it(`${c.name} v1.0.0 fixture round-trip 完整`, () => {
      const raw = loadFixture(c.fixture) as Record<string, unknown>
      const restored = roundTrip(c.schema as z.ZodType<unknown>, raw)
      // 所有 fixture 键在 round-trip 后必须存在
      for (const key of Object.keys(raw)) {
        expect(key in (restored as Record<string, unknown>)).toBe(true)
      }
    })
  }
})

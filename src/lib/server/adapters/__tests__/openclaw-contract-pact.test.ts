/**
 * OpenClaw Adapter — Contract Pact 测试（P1-7 轻量版 Pact）
 *
 * 用 zod schema + JSON snapshot 守门 OpenClaw mock 响应。
 * 任务执行 mock 含随机延迟 / 失败率：测试中通过 inputs.mockForceSuccess=true
 * 强制成功路径，避免抖动。
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { openclawMock } from "../openclaw/mock"
import {
  OPENCLAW_RESPONSE_SCHEMAS,
  OPENCLAW_ADAPTER_CONTRACT_VERSION,
} from "../openclaw/types"

const sampleRequests: Record<keyof typeof OPENCLAW_RESPONSE_SCHEMAS, unknown> = {
  "/tasks/execute": {
    taskId: "task-pact",
    inputs: {
      taskName: "pact-task",
      agentId: "agent-pact",
      workflowRunId: "run-pact",
      mockForceSuccess: true,
    },
  },
  "/connectors/status": {
    connectorId: "connector-pact",
  },
  "/data/sync": {
    source: "src",
    target: "dst",
    mode: "full",
  },
}

const FIXTURE_PATH = path.join(
  __dirname,
  "..",
  "__fixtures__",
  "openclaw-responses.json",
)

interface FixtureFile {
  contractVersion: number
  responses: Record<string, unknown>
}

function loadFixtures(): FixtureFile | null {
  if (!fs.existsSync(FIXTURE_PATH)) return null
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf-8")) as FixtureFile
}

/** 屏蔽运行时变量，便于稳定 fixture 对比 */
function normalize(value: unknown): unknown {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return "<ISO_TIMESTAMP>"
    if (/^mock-sync-\d+/.test(value)) return "<SYNC_ID>"
    return value
  }
  if (typeof value === "number") {
    // durationMs / latencyMs / completedAt 数字会随机化 → 占位
    // 在外层根据 key 名定位更安全；此处一律保留数字，let object pass override below
    return value
  }
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      // 抹平随机抖动字段
      if (k === "durationMs" || k === "latencyMs") {
        out[k] = "<NUMBER>"
        continue
      }
      out[k] = normalize(v)
    }
    return out
  }
  return value
}

describe("OpenClaw Adapter Contract Pact", () => {
  it("contractVersion >= 1", () => {
    expect(OPENCLAW_ADAPTER_CONTRACT_VERSION).toBeGreaterThanOrEqual(1)
  })

  for (const [routePath, schema] of Object.entries(OPENCLAW_RESPONSE_SCHEMAS)) {
    it(`mock 响应 ${routePath} 应能通过 zod 契约 schema 校验`, async () => {
      const body = sampleRequests[routePath as keyof typeof sampleRequests]
      const response = await openclawMock.handle(routePath, body)
      const result = schema.safeParse(response)
      if (!result.success) {
         
        console.error(
          `[openclaw-contract-pact] schema 校验失败 → ${routePath}`,
          JSON.stringify(result.error.format(), null, 2),
        )
      }
      expect(result.success).toBe(true)
    })
  }

  it("OpenClaw mock 响应快照应与 __fixtures__/openclaw-responses.json 一致", async () => {
    const captured: Record<string, unknown> = {}
    for (const route of Object.keys(OPENCLAW_RESPONSE_SCHEMAS)) {
      const body = sampleRequests[route as keyof typeof sampleRequests]
      const resp = await openclawMock.handle(route, body)
      captured[route] = normalize(resp)
    }

    const next: FixtureFile = {
      contractVersion: OPENCLAW_ADAPTER_CONTRACT_VERSION,
      responses: captured,
    }

    const existing = loadFixtures()
    if (!existing) {
      fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true })
      fs.writeFileSync(FIXTURE_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8")
      expect(existing).toBeNull()
      return
    }

    expect(existing.contractVersion).toBe(OPENCLAW_ADAPTER_CONTRACT_VERSION)
    expect(existing.responses).toEqual(captured)
  })
})

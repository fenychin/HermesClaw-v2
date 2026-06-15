/**
 * Hermes Adapter — Contract Pact 测试（P1-7 轻量版 Pact）
 *
 * 目的：把 hermes mock.ts 当下输出的所有响应固化为 fixtures，并用
 * `HERMES_RESPONSE_SCHEMAS` 中的 zod schema 严格校验。
 * 任何 mock 字段漂移、类型缩窄都会被立即发现；当 Hermes 真实 API 接入时，
 * 把真实响应 dump 到同一个 fixtures 文件即可复用此守门测试。
 *
 * 不引入 Pact 库 —— 用 zod + JSON snapshot 自实现。
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { hermesMock } from "../hermes/mock"
import {
  HERMES_RESPONSE_SCHEMAS,
  HERMES_ADAPTER_CONTRACT_VERSION,
} from "../hermes/types"

// ─── 代表性请求体（由 contract 测试发起，用于驱动 mock handler）─────
const sampleRequests: Record<keyof typeof HERMES_RESPONSE_SCHEMAS, unknown> = {
  "/workflows/run": {
    workflowId: "wf-pact-test",
    inputs: { topic: "contract test" },
  },
  "/harness/evaluate": {
    workspaceId: "ws-pact",
    agentId: "agent-pact",
    triggerReason: "pact-test",
  },
  "/memory/write": {
    level: "short",
    key: "pact-key",
    value: "pact-value",
  },
  "/memory/read": {
    level: "short",
    key: "pact-key",
  },
  "/sessions/create": {
    agentId: "agent-pact",
    workspaceId: "ws-pact",
  },
  "/sessions/close": {
    sessionId: "mock-session-pact",
  },
  "/sessions/tool-calls": {
    sessionId: "mock-session-pact",
    traces: [],
  },
  "/harness/report": {
    reportId: "report-pact",
    workspaceId: "ws-pact",
    triggeredBy: "manual",
    evaluatedAt: "2026-06-14T00:00:00Z",
    metrics: {
      total: 100,
      errors: 5,
      success: 95,
      errorRate: 0.05,
      successRate: 0.95,
      windowHours: 24,
    },
    triggered: true,
    provider: "anthropic",
    model: "claude-opus-4-8",
  },
  "/health": {},
}

const FIXTURE_PATH = path.join(
  __dirname,
  "..",
  "__fixtures__",
  "hermes-responses.json",
)

interface FixtureFile {
  contractVersion: number
  responses: Record<string, unknown>
}

function loadFixtures(): FixtureFile | null {
  if (!fs.existsSync(FIXTURE_PATH)) return null
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf-8")) as FixtureFile
}

/** 把对象里的运行时易变字段（时间戳、随机 ID）替换为占位符，便于稳定快照对比 */
function normalize(value: unknown): unknown {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return "<ISO_TIMESTAMP>"
    if (/^HEP-\d+/.test(value)) return "<HEP_ID>"
    if (/^mock-session-\d+/.test(value)) return "<SESSION_ID>"
    if (/^mock-report-\d+/.test(value)) return "<REPORT_ID>"
    return value
  }
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalize(v)
    }
    return out
  }
  return value
}

describe("Hermes Adapter Contract Pact", () => {
  it("contractVersion 与 types.ts 中常量保持单调递增/对齐", () => {
    expect(HERMES_ADAPTER_CONTRACT_VERSION).toBeGreaterThanOrEqual(1)
  })

  for (const [routePath, schema] of Object.entries(HERMES_RESPONSE_SCHEMAS)) {
    it(`mock 响应 ${routePath} 应能通过 zod 契约 schema 校验`, () => {
      const body = sampleRequests[routePath as keyof typeof sampleRequests]
      const response = hermesMock.handle(routePath, body)
      const result = schema.safeParse(response)
      if (!result.success) {
        // eslint-disable-next-line no-console
        console.error(
          `[hermes-contract-pact] schema 校验失败 → ${routePath}`,
          JSON.stringify(result.error.format(), null, 2),
        )
      }
      expect(result.success).toBe(true)
    })
  }

  it("Hermes mock 响应快照应与 __fixtures__/hermes-responses.json 一致", () => {
    const captured: Record<string, unknown> = {}
    for (const route of Object.keys(HERMES_RESPONSE_SCHEMAS)) {
      const body = sampleRequests[route as keyof typeof sampleRequests]
      const resp = hermesMock.handle(route, body)
      captured[route] = normalize(resp)
    }

    const next: FixtureFile = {
      contractVersion: HERMES_ADAPTER_CONTRACT_VERSION,
      responses: captured,
    }

    const existing = loadFixtures()
    if (!existing) {
      fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true })
      fs.writeFileSync(FIXTURE_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8")
      // 首次运行：fixtures 不存在 → 写入后立即通过（CI 第二次跑会进入对比分支）
      expect(existing).toBeNull()
      return
    }

    expect(existing.contractVersion).toBe(HERMES_ADAPTER_CONTRACT_VERSION)
    expect(existing.responses).toEqual(captured)
  })
})

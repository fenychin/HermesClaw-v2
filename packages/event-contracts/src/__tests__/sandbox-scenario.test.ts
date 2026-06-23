/**
 * SandboxScenario 单元测试。
 */
import { describe, it, expect } from "vitest"
import {
  SandboxScenarioRequestSchema,
  ScenarioResultSchema,
  type SandboxScenarioRequest,
  type ScenarioResult,
} from "../sandbox-scenario"

const validRequest: SandboxScenarioRequest = {
  requestId: "req_001",
  workspaceId: "ws_demo",
  industryId: "foreign-trade",
  automationLevel: "L1",
  scenarioInput: { targetMarket: "欧盟" },
  hypothesisLabel: "测试假设",
  callbackTarget: "topic:sandbox.result",
  idempotencyKey: "idem_001",
  version: "1.0.0",
}

const validResult: ScenarioResult = {
  runId: "run_001",
  paths: [
    {
      label: "PATH_A",
      description: "最优路径",
      winRate: 0.72,
      data: [{ t: "Q1", value: 100 }, { t: "Q2", value: 115 }],
      isRecommended: true,
    },
    {
      label: "PATH_B",
      description: "基准路径",
      winRate: 0.45,
      data: [{ t: "Q1", value: 100 }, { t: "Q2", value: 105 }],
      isRecommended: false,
    },
    {
      label: "PATH_C",
      description: "最差路径",
      winRate: 0.15,
      data: [{ t: "Q1", value: 100 }, { t: "Q2", value: 82 }],
      isRecommended: false,
    },
  ],
  recommendations: [
    {
      recommendationId: "rec_001",
      title: "测试建议",
      description: "",
      priority: 1,
      linkedPath: "PATH_A",
      estimatedImpact: "",
    },
  ],
  disclaimer: "AI 建议 / 仅供参考",
  generatedAt: "2026-06-22T10:00:00Z",
  version: "1.0.0",
}

describe("SandboxScenarioRequest", () => {
  it("合法 payload 通过", () => {
    expect(SandboxScenarioRequestSchema.parse(validRequest)).toEqual(validRequest)
  })

  it("序列化 round-trip 一致", () => {
    const restored = SandboxScenarioRequestSchema.parse(JSON.parse(JSON.stringify(validRequest)))
    expect(restored).toEqual(validRequest)
  })

  it("automationLevel 必须为 L1", () => {
    expect(
      SandboxScenarioRequestSchema.safeParse({ ...validRequest, automationLevel: "L2" }).success,
    ).toBe(false)
    expect(
      SandboxScenarioRequestSchema.safeParse({ ...validRequest, automationLevel: "L3" }).success,
    ).toBe(false)
  })

  it("缺 hypothesisLabel 被拒", () => {
    const { hypothesisLabel, ...broken } = validRequest
    expect(SandboxScenarioRequestSchema.safeParse(broken).success).toBe(false)
  })

  it("缺 idempotencyKey 被拒", () => {
    const { idempotencyKey, ...broken } = validRequest
    expect(SandboxScenarioRequestSchema.safeParse(broken).success).toBe(false)
  })

  it("version 必须为 semver", () => {
    expect(
      SandboxScenarioRequestSchema.safeParse({ ...validRequest, version: "1.0" }).success,
    ).toBe(false)
  })
})

describe("ScenarioResult", () => {
  it("合法 payload 通过", () => {
    expect(ScenarioResultSchema.parse(validResult)).toEqual(validResult)
  })

  it("paths 必须恰好 3 条", () => {
    expect(
      ScenarioResultSchema.safeParse({ ...validResult, paths: validResult.paths.slice(0, 2) }).success,
    ).toBe(false)
    expect(
      ScenarioResultSchema.safeParse({ ...validResult, paths: [...validResult.paths, validResult.paths[0]] }).success,
    ).toBe(false)
  })

  it("path label 必须为 PATH_A/B/C", () => {
    const broken = {
      ...validResult,
      paths: validResult.paths.map((p, i) => ({
        ...p,
        label: i === 0 ? "PATH_X" as const : p.label,
      })),
    }
    expect(ScenarioResultSchema.safeParse(broken).success).toBe(false)
  })

  it("winRate 超出 0-1 被拒", () => {
    const broken = {
      ...validResult,
      paths: [{ ...validResult.paths[0], winRate: 1.5 }, validResult.paths[1], validResult.paths[2]],
    }
    expect(ScenarioResultSchema.safeParse(broken).success).toBe(false)
  })

  it("path.data 为空被拒", () => {
    const broken = {
      ...validResult,
      paths: [{ ...validResult.paths[0], data: [] }, validResult.paths[1], validResult.paths[2]],
    }
    expect(ScenarioResultSchema.safeParse(broken).success).toBe(false)
  })

  it("disclaimer 不能为空", () => {
    expect(
      ScenarioResultSchema.safeParse({ ...validResult, disclaimer: "" }).success,
    ).toBe(false)
  })

  it("recommendation linkedPath 必须对应存在路径", () => {
    const broken = {
      ...validResult,
      recommendations: [{ ...validResult.recommendations[0], linkedPath: "PATH_X" }],
    }
    expect(ScenarioResultSchema.safeParse(broken).success).toBe(false)
  })
})

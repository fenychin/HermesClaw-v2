/**
 * policy-resolver 单测：mock prisma.automationPolicy.findMany 注入候选行，
 * 验证三级回退优先级、source 分类、越界 fallback、approverIds JSON 解析、
 * priority 排序、clamp 等行为。
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

// 必须在动态 import 被测模块之前 mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationPolicy: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/prisma"
import {
  resolveAutomationPolicy,
  clampAutomationLevel,
} from "@/lib/automation/policy-resolver"

const mockedFindMany = prisma.automationPolicy.findMany as unknown as ReturnType<typeof vi.fn>

interface FakeRow {
  id: string
  agentId: string | null
  actionType: string | null
  automationLevel: string
  riskLevel: string
  requireApproval: boolean
  requireApproverIds: string
  priority: number
}

function row(partial: Partial<FakeRow>, id = "p1"): FakeRow {
  return {
    id,
    agentId: null,
    actionType: null,
    automationLevel: "L1",
    riskLevel: "low",
    requireApproval: false,
    requireApproverIds: "[]",
    priority: 0,
    ...partial,
  }
}

describe("policy-resolver / resolveAutomationPolicy 三级回退", () => {
  beforeEach(() => {
    mockedFindMany.mockReset()
  })

  it("无任何记录 → system-default L1/low", async () => {
    mockedFindMany.mockResolvedValue([])
    const r = await resolveAutomationPolicy("ws-1", "agent-1", "send_email")
    expect(r.source).toBe("system-default")
    expect(r.automationLevel).toBe("L1")
    expect(r.riskLevel).toBe("low")
    expect(r.policyId).toBeNull()
  })

  it("仅 workspace-default 命中", async () => {
    mockedFindMany.mockResolvedValue([
      row({ id: "p-ws", automationLevel: "L2", riskLevel: "medium" }),
    ])
    const r = await resolveAutomationPolicy("ws-1", "agent-1", "send_email")
    expect(r.source).toBe("workspace-default")
    expect(r.automationLevel).toBe("L2")
    expect(r.riskLevel).toBe("medium")
    expect(r.policyId).toBe("p-ws")
  })

  it("workspace + agent-default 同时存在 → 优先 agent-default", async () => {
    mockedFindMany.mockResolvedValue([
      row({ id: "p-ws", automationLevel: "L2" }),
      row({ id: "p-agent", agentId: "agent-1", automationLevel: "L3" }),
    ])
    const r = await resolveAutomationPolicy("ws-1", "agent-1", "send_email")
    expect(r.source).toBe("agent-default")
    expect(r.automationLevel).toBe("L3")
    expect(r.policyId).toBe("p-agent")
  })

  it("三级齐全 → 优先 action-specific", async () => {
    mockedFindMany.mockResolvedValue([
      row({ id: "p-ws", automationLevel: "L2" }),
      row({ id: "p-agent", agentId: "agent-1", automationLevel: "L3" }),
      row({
        id: "p-action",
        agentId: "agent-1",
        actionType: "send_email",
        automationLevel: "L1",
      }),
    ])
    const r = await resolveAutomationPolicy("ws-1", "agent-1", "send_email")
    expect(r.source).toBe("action-specific")
    expect(r.automationLevel).toBe("L1")
    expect(r.policyId).toBe("p-action")
  })

  it("仅 agent-default + 调用方传 actionType → 仍命中 agent-default", async () => {
    mockedFindMany.mockResolvedValue([
      row({ id: "p-agent", agentId: "agent-1", automationLevel: "L2" }),
    ])
    const r = await resolveAutomationPolicy("ws-1", "agent-1", "send_email")
    expect(r.source).toBe("agent-default")
    expect(r.automationLevel).toBe("L2")
  })

  it("agentId 传 null + actionType 非空 → 不会命中 'agent+action' 行", async () => {
    // DB 里只有一条 agent+action 行，但调用方 agentId=null：
    // findMany 的 OR 不会包含 (agentId=null, actionType!=null) 组合，预期 fallback 到系统默认。
    mockedFindMany.mockResolvedValue([])
    const r = await resolveAutomationPolicy("ws-1", null, "send_email")
    expect(r.source).toBe("system-default")
    // 关键：传给 prisma 的 OR 条件里不应包含 (agentId=null, actionType:"send_email")
    const callArg = mockedFindMany.mock.calls[0][0]
    expect(callArg.where.OR).toEqual([{ agentId: null, actionType: null }])
  })
})

describe("policy-resolver / 越界与坏数据兜底", () => {
  beforeEach(() => mockedFindMany.mockReset())

  it("automationLevel='L99' 越界 → 该行被忽略，回到 system-default", async () => {
    mockedFindMany.mockResolvedValue([
      row({ id: "p-bad", automationLevel: "L99" }),
    ])
    const r = await resolveAutomationPolicy("ws-1", null, null)
    expect(r.source).toBe("system-default")
  })

  it("riskLevel='extreme' 越界 → 该行被忽略", async () => {
    mockedFindMany.mockResolvedValue([
      row({ id: "p-bad", riskLevel: "extreme" }),
    ])
    const r = await resolveAutomationPolicy("ws-1", null, null)
    expect(r.source).toBe("system-default")
  })

  it("requireApproverIds 非合法 JSON → 兜底空数组", async () => {
    mockedFindMany.mockResolvedValue([
      row({ id: "p-ws", requireApproverIds: "not-json" }),
    ])
    const r = await resolveAutomationPolicy("ws-1", null, null)
    expect(r.approverIds).toEqual([])
  })

  it("requireApproverIds 是合法 JSON 数组 → 解析成 string[]", async () => {
    mockedFindMany.mockResolvedValue([
      row({ id: "p-ws", requireApproverIds: '["alice","bob"]' }),
    ])
    const r = await resolveAutomationPolicy("ws-1", null, null)
    expect(r.approverIds).toEqual(["alice", "bob"])
  })

  it("DB 里出现 agentId=null + actionType!=null 这种非法组合行 → 忽略", async () => {
    mockedFindMany.mockResolvedValue([
      row({ id: "p-bad", agentId: null, actionType: "send_email" }),
    ])
    const r = await resolveAutomationPolicy("ws-1", "agent-1", "send_email")
    expect(r.source).toBe("system-default")
  })
})

describe("policy-resolver / priority 排序", () => {
  beforeEach(() => mockedFindMany.mockReset())

  it("同 source 多行时取 priority 高者", async () => {
    // 两条 workspace-default 行（业务上不可能，因为有唯一约束；防御编程兜底）
    mockedFindMany.mockResolvedValue([
      row({ id: "p-low", priority: 1, automationLevel: "L1" }),
      row({ id: "p-high", priority: 99, automationLevel: "L2" }),
    ])
    const r = await resolveAutomationPolicy("ws-1", null, null)
    expect(r.policyId).toBe("p-high")
    expect(r.automationLevel).toBe("L2")
  })
})

describe("clampAutomationLevel", () => {
  it("requested L4 + policy L1 → L1（强制降级）", () => {
    expect(clampAutomationLevel("L4", "L1")).toBe("L1")
  })
  it("requested L1 + policy L4 → L1（不抬升）", () => {
    expect(clampAutomationLevel("L1", "L4")).toBe("L1")
  })
  it("requested L2 + policy L2 → L2（相等保持）", () => {
    expect(clampAutomationLevel("L2", "L2")).toBe("L2")
  })
  it("requested L3 + policy L2 → L2（钳制到 policyMax）", () => {
    expect(clampAutomationLevel("L3", "L2")).toBe("L2")
  })
  it("requested L2 + policy L3 → L2（不抬升）", () => {
    expect(clampAutomationLevel("L2", "L3")).toBe("L2")
  })
})

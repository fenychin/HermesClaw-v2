import { describe, it, expect, vi } from "vitest"
import { enforceBoundary, enforceAutomationGate } from "../policy/boundary-enforcer"

function makePrismaMock(overrides: Record<string, any> = {}) {
  const base = {
    agent: {
      findFirst: vi.fn(async () => ({ id: "agent-001" })),
    },
    workspaceSettings: {
      findUnique: vi.fn(async () => null),
    },
  }
  return { ...base, ...overrides } as any
}

describe("enforceBoundary — Sprint D 回归场景", () => {
  it("同 workspace 内直接放行（回归场景 1）", async () => {
    const prisma = makePrismaMock()
    const result = await enforceBoundary({
      agentId: "agent-001",
      workspaceId: "ws-a",
      targetWorkspaceId: "ws-a",
      prisma,
    })
    expect(result.allowed).toBe(true)
    expect(prisma.agent.findFirst).not.toHaveBeenCalled()
  })

  it("跨 workspace + agent 在目标 workspace 中没有 → 拒绝（回归场景 2）", async () => {
    const prisma = makePrismaMock({
      agent: {
        findFirst: vi.fn(async () => null),
      },
    })
    const result = await enforceBoundary({
      agentId: "agent-001",
      workspaceId: "ws-a",
      targetWorkspaceId: "ws-b",
      prisma,
    })
    expect(result.allowed).toBe(false)
    expect(result.violation).toBe("智能体不存在于目标 Workspace")
  })

  it("不存在的 agentId + 不同 workspace → 拒绝（回归场景 3）", async () => {
    const prisma = makePrismaMock({
      agent: {
        findFirst: vi.fn(async () => null),
      },
    })
    const result = await enforceBoundary({
      agentId: "non-existent-agent",
      workspaceId: "ws-a",
      targetWorkspaceId: "ws-b",
      prisma,
    })
    expect(result.allowed).toBe(false)
    expect(result.violation).toBe("智能体不存在于目标 Workspace")
  })

  it("跨 workspace + agent 存在于目标 workspace → 放行", async () => {
    const prisma = makePrismaMock({
      agent: {
        findFirst: vi.fn(async () => ({ id: "agent-001" })),
      },
    })
    const result = await enforceBoundary({
      agentId: "agent-001",
      workspaceId: "ws-a",
      targetWorkspaceId: "ws-b",
      prisma,
    })
    expect(result.allowed).toBe(true)
    expect(prisma.agent.findFirst).toHaveBeenCalledWith({
      where: { id: "agent-001", workspaceId: "ws-b" },
      select: { id: true },
    })
  })

  it("同 workspace 不同 agentId 也直接放行（不做 DB 查询）（回归场景 4）", async () => {
    const prisma = makePrismaMock()
    const result = await enforceBoundary({
      agentId: "agent-999",
      workspaceId: "ws-default",
      targetWorkspaceId: "ws-default",
      prisma,
    })
    expect(result.allowed).toBe(true)
    expect(prisma.agent.findFirst).not.toHaveBeenCalled()
  })
})

describe("enforceAutomationGate — 自动化等级门禁", () => {
  it("L1 直接通过", async () => {
    const prisma = makePrismaMock()
    const result = await enforceAutomationGate({
      automationLevel: "L1",
      riskLevel: "high",
      workspaceId: "ws-1",
      prisma,
    })
    expect(result.allowed).toBe(true)
    expect(result.requiresApproval).toBe(false)
  })

  it("L2 直接通过", async () => {
    const prisma = makePrismaMock()
    const result = await enforceAutomationGate({
      automationLevel: "L2",
      riskLevel: "high",
      workspaceId: "ws-1",
      prisma,
    })
    expect(result.allowed).toBe(true)
    expect(result.requiresApproval).toBe(false)
  })

  it("L3 + confirmed=true → 通过", async () => {
    const prisma = makePrismaMock()
    const result = await enforceAutomationGate({
      automationLevel: "L3",
      riskLevel: "medium",
      workspaceId: "ws-1",
      prisma,
      confirmed: true,
    })
    expect(result.allowed).toBe(true)
    expect(result.requiresApproval).toBe(false)
  })

  it("L3 + maxAutomationLevel=L3 → 通过", async () => {
    const prisma = makePrismaMock({
      workspaceSettings: {
        findUnique: vi.fn(async () => ({
          maxAutomationLevel: "L3",
        })),
      },
    })
    const result = await enforceAutomationGate({
      automationLevel: "L3",
      riskLevel: "low",
      workspaceId: "ws-1",
      prisma,
    })
    expect(result.allowed).toBe(true)
    expect(result.requiresApproval).toBe(false)
  })

  it("L3 + maxAutomationLevel=L4 → 通过", async () => {
    const prisma = makePrismaMock({
      workspaceSettings: {
        findUnique: vi.fn(async () => ({
          maxAutomationLevel: "L4",
        })),
      },
    })
    const result = await enforceAutomationGate({
      automationLevel: "L3",
      riskLevel: "low",
      workspaceId: "ws-1",
      prisma,
    })
    expect(result.allowed).toBe(true)
    expect(result.requiresApproval).toBe(false)
  })

  it("L3 + 未确认且无 WorkspaceSettings 配置 → 需审批", async () => {
    const prisma = makePrismaMock({
      workspaceSettings: {
        findUnique: vi.fn(async () => null),
      },
    })
    const result = await enforceAutomationGate({
      automationLevel: "L3",
      riskLevel: "high",
      workspaceId: "ws-1",
      prisma,
    })
    expect(result.allowed).toBe(true)
    expect(result.requiresApproval).toBe(true)
    expect(result.message).toContain("需要确认")
  })

  it("L3 + maxAutomationLevel 非 L3/L4 → 需审批", async () => {
    const prisma = makePrismaMock({
      workspaceSettings: {
        findUnique: vi.fn(async () => ({
          maxAutomationLevel: "L2",
        })),
      },
    })
    const result = await enforceAutomationGate({
      automationLevel: "L3",
      riskLevel: "medium",
      workspaceId: "ws-1",
      prisma,
    })
    expect(result.allowed).toBe(true)
    expect(result.requiresApproval).toBe(true)
  })

  it("L4 + low risk → 始终需要人工审批（新增场景）", async () => {
    const prisma = makePrismaMock()
    const result = await enforceAutomationGate({
      automationLevel: "L4",
      riskLevel: "low",
      workspaceId: "ws-1",
      prisma,
    })
    expect(result.allowed).toBe(false)
    expect(result.requiresApproval).toBe(true)
    expect(result.message).toContain("L4")
    expect(result.message).toContain("人工审批")
  })

  it("L4 + high risk → 始终需要人工审批", async () => {
    const prisma = makePrismaMock()
    const result = await enforceAutomationGate({
      automationLevel: "L4",
      riskLevel: "high",
      workspaceId: "ws-1",
      prisma,
    })
    expect(result.allowed).toBe(false)
    expect(result.requiresApproval).toBe(true)
    expect(result.message).toContain("L4")
  })
})

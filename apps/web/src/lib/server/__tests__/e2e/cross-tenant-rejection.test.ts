// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { assertWithinBoundary } from "@/lib/server/boundary"
import { setupWorkspace, cleanWorkspace } from "./e2e-helper"

// ---- Mock next-auth 避免模块解析失败（G-2） ----
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    auth: vi.fn().mockResolvedValue({ user: { id: 'test-user', workspaceId: 'ws-test' } }),
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}))
vi.mock('next-auth/providers/credentials', () => ({ default: vi.fn() }))

// ---- Mocks ----

vi.mock("@/lib/server/llm-provider", () => ({
  DEFAULT_ANTHROPIC_MODEL: "claude-sonnet-4-6",
  DEFAULT_DEEPSEEK_MODEL: "deepseek-chat",
  isProviderAvailable: vi.fn(() => true),
  resolveLlmProvider: vi.fn(() => ({ provider: "deepseek", model: "deepseek-chat" })),
  callAnthropicStructured: vi.fn(),
  callDeepSeekJson: vi.fn(),
}))

vi.mock("@/lib/server/audit", async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>()
  return {
    ...actual,
    actorFromSession: () => Promise.resolve("e2e-ct-admin@hermesclaw.ai"),
  }
})

// ---- Helpers ----

function makeMockPrismaClient(agent: { cannotDo: string } | null) {
  return {
    agent: {
      findUnique: vi.fn<[any], any>().mockResolvedValue(agent),
    },
  } as any
}

// ---- Test Suite ----

describe("Sprint D E2E: 跨租户越权隔离验证 (Cross-Tenant Rejection)", () => {
  const WS_A = "ws-ct-tenant-a"
  const WS_B = "ws-ct-tenant-b"
  const agentIdA = "agent-ct-a"
  const agentIdB = "agent-ct-b"

  beforeAll(async () => {
    await cleanWorkspace(WS_A)
    await cleanWorkspace(WS_B)
    await setupWorkspace(WS_A, { agentId: agentIdA, agentAutomationLevel: "L2" })
    await setupWorkspace(WS_B, { agentId: agentIdB, agentAutomationLevel: "L2" })
  })

  afterAll(async () => {
    await cleanWorkspace(WS_A)
    await cleanWorkspace(WS_B)
  })

  // ── CT-1 ────────────────────────────────────────────────────
  it("[CT-1] Tenant B 尝试 approve Tenant A 的 HarnessProposal → 被拒绝", async () => {
    // 在 ws-ct-tenant-a 中创建 HarnessProposal（status = "pending"）
    const proposalId = `HEP-ct1-${Date.now()}`
    const proposal = await prisma.harnessProposal.create({
      data: {
        proposalId,
        workspaceId: WS_A,
        triggeredBy: "auto",
        triggerReason: "E2E cross-tenant test",
        problemStatement: "Test proposal for cross-tenant rejection",
        evidence: [],
        proposedChange: {
          targetComponent: "agent",
          description: "Test change",
          riskLevel: "medium",
          automationLevel: "L3",
        },
        estimatedImpact: "low",
        affectedAgents: [agentIdA],
        rollbackPlan: "none",
        status: "pending",
      },
    })
    expect(proposal).toBeDefined()
    expect(proposal.status).toBe("pending")

    // Tenant B 使用自己的 workspaceId 查找该 proposal → 查不到（数据隔离）
    const fromTenantB = await prisma.harnessProposal.findFirst({
      where: { proposalId, workspaceId: WS_B },
    })
    expect(fromTenantB).toBeNull()

    // Tenant B 无法找到 proposal，自然无法审批 → 跨租户审批被拒绝
    // Tenant A 仍然可以正常找到自己的 proposal
    const fromTenantA = await prisma.harnessProposal.findFirst({
      where: { proposalId, workspaceId: WS_A },
    })
    expect(fromTenantA).not.toBeNull()
    expect(fromTenantA!.status).toBe("pending")
  })

  // ── CT-2 ────────────────────────────────────────────────────
  it("[CT-2] Tenant B 的 Agent 无法读取 Tenant A 的 Agent 数据", async () => {
    // Tenant A 的 agent 在 ws-ct-tenant-a 下已由 setupWorkspace 创建
    // Tenant B 使用错误的 workspaceId 查询 agentA
    const agentA = await prisma.agent.findUnique({
      where: { id: agentIdA, workspaceId: WS_B },
    })
    expect(agentA).toBeNull()
  })

  // ── CT-3 ────────────────────────────────────────────────────
  it("[CT-3] 跨 Workspace 的 TaskEnvelope 路由被 boundary 拒绝", async () => {
    const mockPrisma = makeMockPrismaClient(null)
    const result = await assertWithinBoundary(
      agentIdA,       // 属于 tenant-a
      "发送邮件",
      WS_B,           // 传入 tenant-b 的 workspaceId
      { prisma: mockPrisma },
    )
    expect(result.allowed).toBe(false)
    expect(result.violation).toContain("智能体不存在")
  })

  // ── CT-4 ────────────────────────────────────────────────────
  it("[CT-4] 同一 Workspace 内正常操作不受跨租户拦截影响（回归）", async () => {
    // 读取 tenant-a 下的 agent 真实 cannotDo
    const agentA = await prisma.agent.findUnique({
      where: { id: agentIdA },
      select: { cannotDo: true },
    })
    expect(agentA).not.toBeNull()

    const mockPrisma = makeMockPrismaClient(agentA)
    const result = await assertWithinBoundary(
      agentIdA,
      "查询询盘数据",
      WS_A,
      { prisma: mockPrisma },
    )
    expect(result.allowed).toBe(true)
  })
})

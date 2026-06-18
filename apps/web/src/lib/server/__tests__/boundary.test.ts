import { describe, it, expect, vi, beforeEach } from "vitest"
import { assertWithinBoundary } from "../boundary"
import type { BoundaryCheckResult } from "../boundary"

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: null as any,
}))

vi.mock("@/lib/server/llm-provider", () => ({
  resolveLlmProvider: vi.fn(() => ({ provider: "deepseek", model: "deepseek-chat" })),
  callAnthropicStructured: vi.fn(),
  callDeepSeekJson: vi.fn(),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function makeMockAgent(cannotDo: string[]) {
  return { cannotDo: JSON.stringify(cannotDo) }
}

function makeMockClient(agent: { cannotDo: string } | null) {
  return {
    agent: {
      findUnique: vi.fn<[any], any>().mockResolvedValue(agent),
    },
  } as any
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("assertWithinBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 场景 1：同 Workspace 内允许正常操作
  it("应该允许同 workspace 内的正常操作", async () => {
    const agentData = makeMockAgent(["make financial decisions"])
    const mockClient = makeMockClient(agentData)
    const result: BoundaryCheckResult = await assertWithinBoundary(
      "agent-001",
      "发送询盘跟进邮件给客户",
      "ws-tenant-a",
      { prisma: mockClient },
    )
    expect(result.allowed).toBe(true)
  })

  // 场景 2：跨 Workspace 隔离
  it("跨 workspace 调用应拒绝（agent 不存在于目标 workspace）", async () => {
    const mockClient = makeMockClient(null)
    const result: BoundaryCheckResult = await assertWithinBoundary(
      "agent-002",
      "发送邮件",
      "ws-tenant-a",
      { prisma: mockClient },
    )
    expect(result.allowed).toBe(false)
    expect(result.violation).toContain("智能体不存在")
  })

  // 场景 3：不存在的 agentId + 任意 workspaceId
  it("不存在的 agentId 应拒绝", async () => {
    const mockClient = makeMockClient(null)
    const result: BoundaryCheckResult = await assertWithinBoundary(
      "non-existent-agent",
      "查看报表",
      "ws-anything",
      { prisma: mockClient },
    )
    expect(result.allowed).toBe(false)
    expect(result.violation).toContain("智能体不存在")
  })

  // 场景 4：触发硬红线 HARD_REDLINES
  it("硬红线关键词应拒绝", async () => {
    const agentData = makeMockAgent([])
    const mockClient = makeMockClient(agentData)
    const result: BoundaryCheckResult = await assertWithinBoundary(
      "agent-001",
      "执行 rm -rf /prod 清除所有数据",
      "ws-tenant-a",
      { prisma: mockClient },
    )
    expect(result.allowed).toBe(false)
    expect(result.violation).toContain("rm -rf")
  })

  // 场景 5：触发 cannotDo 整句规则匹配
  it("cannotDo 整句精确匹配应拒绝", async () => {
    const agentData = makeMockAgent(["make financial decisions", "自主签署合同"])
    const mockClient = makeMockClient(agentData)
    const result: BoundaryCheckResult = await assertWithinBoundary(
      "agent-001",
      "自主签署合同并完成付款",
      "ws-tenant-a",
      { prisma: mockClient },
    )
    expect(result.allowed).toBe(false)
    expect(result.violation).toBe("自主签署合同")
  })

  // 场景 6：触发 cannotDo 关键词双命中规则（≥2 关键词）
  // 注意：toKeywords() 按 [\s,，、；;。./（）()]+ 分隔，保留 ≥2 字片段
  // "客户,订单" → keywords: ["客户", "订单"] → action "清除客户订单" 包含两者 → 命中
  it("cannotDo 规则中 action 包含 ≥2 个关键词应拒绝", async () => {
    const agentData = makeMockAgent(["客户,订单"])
    const mockClient = makeMockClient(agentData)
    const result: BoundaryCheckResult = await assertWithinBoundary(
      "agent-001",
      "清除客户订单",
      "ws-tenant-a",
      { prisma: mockClient },
    )
    expect(result.allowed).toBe(false)
    expect(result.violation).toBe("客户,订单")
  })

  // 场景 7：cannotDo 为空时直接放行（不触发 LLM）
  it("cannotDo 为空数组时应直接放行且不调用 LLM", async () => {
    const agentData = makeMockAgent([])
    const mockClient = makeMockClient(agentData)
    const { callDeepSeekJson } = await import("@/lib/server/llm-provider")
    const result: BoundaryCheckResult = await assertWithinBoundary(
      "agent-001",
      "查看报表",
      "ws-tenant-a",
      { prisma: mockClient },
    )
    expect(result.allowed).toBe(true)
    expect(callDeepSeekJson).not.toHaveBeenCalled()
  })
})

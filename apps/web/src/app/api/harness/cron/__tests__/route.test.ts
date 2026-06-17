import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { rollbackHarnessProposal } from "@/lib/server/harness/harness-rollback"
import { prisma } from "@/lib/prisma"

// mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// mock runHarnessEvaluation
vi.mock("@/lib/server/harness-eval", () => ({
  runHarnessEvaluation: vi.fn(() =>
    Promise.resolve({
      triggered: false,
      proposal: null,
    })
  ),
  EVAL_WINDOW_HOURS: 72,
}))

// mock rollbackHarnessProposal
vi.mock("@/lib/server/harness/harness-rollback", () => ({
  rollbackHarnessProposal: vi.fn(() => Promise.resolve()),
}))

// mock prisma
const mockWorkspaceFindMany = vi.fn()
const mockProposalFindMany = vi.fn()
const mockAgentLogFindMany = vi.fn()
const mockAuditLogCreate = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      findMany: (...args: any[]) => mockWorkspaceFindMany(...args),
    },
    harnessProposal: {
      findMany: (...args: any[]) => mockProposalFindMany(...args),
    },
    agentLog: {
      findMany: (...args: any[]) => mockAgentLogFindMany(...args),
    },
    auditLog: {
      create: (...args: any[]) => mockAuditLogCreate(...args),
    },
  },
}))

describe("GET /api/harness/cron 定时任务评估测试", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认返回一个工作区
    mockWorkspaceFindMany.mockResolvedValue([{ id: "ws-test-1" }])
    // 默认没有 Canary 提案
    mockProposalFindMany.mockResolvedValue([])
    // 默认没有 AgentLog
    mockAgentLogFindMany.mockResolvedValue([])
  })

  it("当无 Canary 提案时，定时任务正常执行，不触发回滚", async () => {
    const req = new Request("http://localhost/api/harness/cron") as any
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(rollbackHarnessProposal).not.toHaveBeenCalled()
  })

  it("当存在 Canary 提案但样本不足 (totalLogs < 5) 时，不触发回滚", async () => {
    // 存在一个 Canary 提案
    mockProposalFindMany.mockResolvedValue([
      {
        id: "proposal-1",
        proposalId: "HEP-001",
        workspaceId: "ws-test-1",
        status: "canary",
        reviewedAt: "2026-06-12T00:00:00Z",
        createdAt: "2026-06-12T00:00:00Z",
      },
    ])

    // 只有 4 个失败日志
    mockAgentLogFindMany.mockResolvedValue([
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
    ])

    const req = new Request("http://localhost/api/harness/cron") as any
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(rollbackHarnessProposal).not.toHaveBeenCalled()
  })

  it("当存在 Canary 提案，运行样本数 >= 5 且失败率较低时，不触发回滚", async () => {
    mockProposalFindMany.mockResolvedValue([
      {
        id: "proposal-1",
        proposalId: "HEP-001",
        workspaceId: "ws-test-1",
        status: "canary",
        reviewedAt: "2026-06-12T00:00:00Z",
        createdAt: "2026-06-12T00:00:00Z",
      },
    ])

    // 5 个日志，其中有 0 个失败（失败率 0%）
    mockAgentLogFindMany.mockResolvedValue([
      { status: "success" },
      { status: "success" },
      { status: "success" },
      { status: "success" },
      { status: "success" },
    ])

    const req = new Request("http://localhost/api/harness/cron") as any
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(rollbackHarnessProposal).not.toHaveBeenCalled()
  })

  it("当存在 Canary 提案，运行样本数 >= 5 且失败率超标 (errorRate > 0.15) 时，自动回滚并记录审计日志", async () => {
    mockProposalFindMany.mockResolvedValue([
      {
        id: "proposal-1",
        proposalId: "HEP-001",
        workspaceId: "ws-test-1",
        status: "canary",
        reviewedAt: "2026-06-12T00:00:00Z",
        createdAt: "2026-06-12T00:00:00Z",
      },
    ])

    // 5 个日志，其中有 1 个失败（失败率 20% > 15%）
    mockAgentLogFindMany.mockResolvedValue([
      { status: "success" },
      { status: "success" },
      { status: "success" },
      { status: "success" },
      { status: "failed" },
    ])

    const req = new Request("http://localhost/api/harness/cron") as any
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    
    // 应该被触发回滚
    expect(rollbackHarnessProposal).toHaveBeenCalledWith("proposal-1", "system")
    
    // 应该写入审计日志
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actor: "system",
          action: "proposal.rollback",
          targetType: "proposal",
          targetId: "proposal-1",
          riskLevel: "high",
        }),
      })
    )
  })
})

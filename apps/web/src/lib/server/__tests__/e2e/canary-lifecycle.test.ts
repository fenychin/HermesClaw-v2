// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { startCanary, activateProposal } from "@hermesclaw/hermes-kernel"
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

describe("E2E Integration Link 6: Canary Lifecycle Complete Path", () => {
  const workspaceId = "ws-e2e-canary-lifecycle"
  const agentId = "agent-e2e-canary-lifecycle"
  const workflowId = "wf-e2e-canary-lifecycle"

  beforeAll(async () => {
    await cleanWorkspace(workspaceId)
    await setupWorkspace(workspaceId, {
      automationLevel: "L3",
      agentId,
      agentAutomationLevel: "L3",
      workflowId
    })
  })

  afterAll(async () => {
    await cleanWorkspace(workspaceId)
  })

  it("approved → canary → active 完整状态跃迁", async () => {
    // 创建一个 approved 状态的 HarnessProposal
    const proposal = await prisma.harnessProposal.create({
      data: {
        id: "prop-e2e-canary-001",
        proposalId: "HEP-e2e-canary-001",
        workspaceId,
        triggeredBy: "manual",
        triggerReason: "E2E Test Canary Lifecycle",
        problemStatement: "Need to test canary lifecycle path",
        evidence: JSON.stringify(["test data"]),
        proposedChange: {
          targetComponent: "任务边界",
          description: "canary lifecycle test",
          riskLevel: "medium",
          automationLevel: "L2"
        } as any,
        estimatedImpact: "improve workflow accuracy",
        rollbackPlan: "rollback to snapshot",
        canaryWindowHours: 12,
        status: "approved"
      }
    })

    // Step 1: 启动 Canary（approved → canary）
    const canaryResult = await startCanary(
      { proposalId: proposal.id, workspaceId, actor: "e2e-admin@hermesclaw.ai" },
      { prisma },
    )

    expect(canaryResult.ok).toBe(true)
    expect(canaryResult.newStatus).toBe("canary")

    // 验证 proposal 状态跃迁
    const afterCanary = await prisma.harnessProposal.findUnique({
      where: { id: proposal.id }
    })
    expect(afterCanary?.status).toBe("canary")
    expect(afterCanary?.canaryStartedAt).toBeTruthy()
    expect(afterCanary?.canaryWindowHours).toBe(12)
    expect(afterCanary?.previousSnapshot).not.toBeNull()

    // 验证审计日志 harness.canary.started
    const startedAudit = await prisma.auditLog.findFirst({
      where: {
        workspaceId,
        action: "harness.canary.started",
        targetId: proposal.id,
      }
    })
    expect(startedAudit).not.toBeNull()
    expect(startedAudit?.actor).toBe("e2e-admin@hermesclaw.ai")

    // Step 2: 激活提案（canary → active）
    const activateResult = await activateProposal(
      { proposalId: proposal.id, workspaceId, actor: "e2e-admin@hermesclaw.ai" },
      { prisma },
    )

    expect(activateResult.ok).toBe(true)
    expect(activateResult.newStatus).toBe("active")

    // 验证 proposal 状态跃迁
    const afterActivate = await prisma.harnessProposal.findUnique({
      where: { id: proposal.id }
    })
    expect(afterActivate?.status).toBe("active")
    expect(afterActivate?.activatedAt).toBeTruthy()

    // 验证审计日志 harness.canary.activated
    const activatedAudit = await prisma.auditLog.findFirst({
      where: {
        workspaceId,
        action: "harness.canary.activated",
        targetId: proposal.id,
      }
    })
    expect(activatedAudit).not.toBeNull()
    expect(activatedAudit?.actor).toBe("e2e-admin@hermesclaw.ai")

    // 验证审计日志时序：harness.canary.started 早于 harness.canary.activated
    expect(startedAudit!.createdAt.getTime()).toBeLessThanOrEqual(activatedAudit!.createdAt.getTime())
  })

  it("重复 startCanary 应失败（状态非 approved）", async () => {
    // 创建已审批提案
    const proposal = await prisma.harnessProposal.create({
      data: {
        id: "prop-e2e-canary-002",
        proposalId: "HEP-e2e-canary-002",
        workspaceId,
        triggeredBy: "manual",
        triggerReason: "E2E Test Duplicate Canary",
        problemStatement: "Need to test duplicate canary rejection",
        evidence: JSON.stringify(["test data"]),
        proposedChange: {
          targetComponent: "任务边界",
          description: "duplicate canary test",
          riskLevel: "low",
          automationLevel: "L2"
        } as any,
        estimatedImpact: "none",
        rollbackPlan: "rollback to snapshot",
        status: "approved"
      }
    })

    // 第一次启动 Canary 应成功
    const first = await startCanary(
      { proposalId: proposal.id, workspaceId, actor: "e2e-admin@hermesclaw.ai" },
      { prisma },
    )
    expect(first.ok).toBe(true)

    // 第二次启动 Canary 应失败（状态已变为 canary）
    const second = await startCanary(
      { proposalId: proposal.id, workspaceId, actor: "e2e-admin@hermesclaw.ai" },
      { prisma },
    )
    expect(second.ok).toBe(false)
    expect(second.message).toContain("不可启动 Canary")
  })

  it("重复 activateProposal 应失败（状态非 canary）", async () => {
    // 创建一个直接进入 canary 状态的提案（用于测试重复激活）
    const proposal = await prisma.harnessProposal.create({
      data: {
        id: "prop-e2e-canary-003",
        proposalId: "HEP-e2e-canary-003",
        workspaceId,
        triggeredBy: "manual",
        triggerReason: "E2E Test Duplicate Activate",
        problemStatement: "Need to test duplicate activate rejection",
        evidence: JSON.stringify(["test data"]),
        proposedChange: {
          targetComponent: "任务边界",
          description: "duplicate activate test",
          riskLevel: "low",
          automationLevel: "L2"
        } as any,
        estimatedImpact: "none",
        rollbackPlan: "rollback to snapshot",
        status: "canary",
        canaryStartedAt: new Date(),
      }
    })

    // 第一次激活应成功
    const first = await activateProposal(
      { proposalId: proposal.id, workspaceId, actor: "e2e-admin@hermesclaw.ai" },
      { prisma },
    )
    expect(first.ok).toBe(true)

    // 第二次激活应失败（状态已变为 active）
    const second = await activateProposal(
      { proposalId: proposal.id, workspaceId, actor: "e2e-admin@hermesclaw.ai" },
      { prisma },
    )
    expect(second.ok).toBe(false)
    expect(second.message).toContain("不可激活")
  })

  it("activateProposal 应拒绝 canaryMetrics 中 workflowFailureRate 过高的提案", async () => {
    const proposal = await prisma.harnessProposal.create({
      data: {
        id: "prop-e2e-canary-004",
        proposalId: "HEP-e2e-canary-004",
        workspaceId,
        triggeredBy: "manual",
        triggerReason: "E2E Test Canary Metrics Failure",
        problemStatement: "Need to test canary metrics rejection",
        evidence: JSON.stringify(["test data"]),
        proposedChange: {
          targetComponent: "任务边界",
          description: "canary metrics failure test",
          riskLevel: "low",
          automationLevel: "L2"
        } as any,
        estimatedImpact: "none",
        rollbackPlan: "rollback to snapshot",
        status: "canary",
        canaryStartedAt: new Date(),
        canaryMetrics: JSON.stringify({ workflowFailureRate: 0.5 }),
      }
    })

    const result = await activateProposal(
      { proposalId: proposal.id, workspaceId, actor: "e2e-admin@hermesclaw.ai" },
      { prisma },
    )
    expect(result.ok).toBe(false)
    expect(result.message).toContain("超过阈值")
  })

  it("激活时应将同 workspace 其他 active 提案置为 superseded", async () => {
    // 创建两个旧 active 提案
    const old1 = await prisma.harnessProposal.create({
      data: {
        id: "prop-e2e-canary-supersede-01",
        proposalId: "HEP-e2e-canary-supersede-01",
        workspaceId,
        triggeredBy: "manual",
        triggerReason: "E2E Test Supersede",
        problemStatement: "Old proposal 1",
        evidence: JSON.stringify(["test"]),
        proposedChange: {} as any,
        estimatedImpact: "none",
        rollbackPlan: "none",
        status: "active",
        activatedAt: new Date(),
      }
    })
    const old2 = await prisma.harnessProposal.create({
      data: {
        id: "prop-e2e-canary-supersede-02",
        proposalId: "HEP-e2e-canary-supersede-02",
        workspaceId,
        triggeredBy: "manual",
        triggerReason: "E2E Test Supersede",
        problemStatement: "Old proposal 2",
        evidence: JSON.stringify(["test"]),
        proposedChange: {} as any,
        estimatedImpact: "none",
        rollbackPlan: "none",
        status: "active",
        activatedAt: new Date(),
      }
    })

    // 创建新的 canary 提案并激活
    const newProposal = await prisma.harnessProposal.create({
      data: {
        id: "prop-e2e-canary-supersede-03",
        proposalId: "HEP-e2e-canary-supersede-03",
        workspaceId,
        triggeredBy: "manual",
        triggerReason: "E2E Test Supersede New",
        problemStatement: "New proposal that supersedes old ones",
        evidence: JSON.stringify(["test"]),
        proposedChange: {} as any,
        estimatedImpact: "none",
        rollbackPlan: "none",
        status: "canary",
        canaryStartedAt: new Date(),
      }
    })

    await activateProposal(
      { proposalId: newProposal.id, workspaceId, actor: "e2e-admin@hermesclaw.ai" },
      { prisma },
    )

    // 验证新提案变为 active
    const activated = await prisma.harnessProposal.findUnique({
      where: { id: newProposal.id }
    })
    expect(activated?.status).toBe("active")

    // 验证旧提案被置为 rolled_back
    const superseded1 = await prisma.harnessProposal.findUnique({
      where: { id: old1.id }
    })
    expect(superseded1?.status).toBe("rolled_back")
    expect(superseded1?.rolledBackAt).toBeTruthy()

    const superseded2 = await prisma.harnessProposal.findUnique({
      where: { id: old2.id }
    })
    expect(superseded2?.status).toBe("rolled_back")
    expect(superseded2?.rolledBackAt).toBeTruthy()
  })
})

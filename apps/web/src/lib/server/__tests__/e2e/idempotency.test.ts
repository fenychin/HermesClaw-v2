// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { startWorkflowRun, executeStep } from "@/lib/server/workflow/runtime-engine"
import { createApprovalCheckpoint, decideApprovalCheckpoint, ApprovalAlreadyDecidedError } from "@/lib/server/approval"
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

describe("E2E Integration Link 4: Idempotency Protection Path", () => {
  const workspaceId = "ws-e2e-idem"
  const agentId = "agent-e2e-idem"
  const workflowId = "wf-e2e-idem"

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

  it("场景 A：WorkflowRun 重复启动幂等", async () => {
    const inputArgs = {
      workflowId,
      workspaceId,
      triggeredBy: "system",
      inputContext: { taskId: "task-idem-A", info: "test" },
      taskId: "task-idem-A"
    }

    const run1 = await startWorkflowRun(inputArgs)
    const run2 = await startWorkflowRun(inputArgs)

    expect(run1).toBeDefined()
    expect(run2).toBeDefined()
    // 断言第二次返回已存在的 runId 
    expect(run2.runId).toBe(run1.runId)

    // 断言 DB 中对应该 taskId 的记录只有 1 条
    const count = await prisma.workflowRun.count({
      where: {
        workspaceId,
        workflowId,
        input: { contains: "task-idem-A" }
      }
    })
    expect(count).toBe(1)
  })

  it("场景 B：ApprovalCheckpoint 重复创建幂等", async () => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const inputArgs = {
      checkpointId: "acp-idem-B",
      taskId: "task-idem-B",
      workspaceId,
      triggerReason: "risk.level.high" as any,
      riskLevel: "high" as const,
      automationLevel: "L3" as const,
      actionSummary: "High-risk checkpoint B",
      inputSnapshot: { param: "value" },
      policySnapshotVersion: "1.0.0",
      expiresAt
    }

    const cp1 = await createApprovalCheckpoint(inputArgs)
    const cp2 = await createApprovalCheckpoint(inputArgs as any) // 强转入参类型以支持 checkpointId

    expect(cp1).toBeDefined()
    expect(cp2).toBeDefined()
    // 断言第二次返回已存在的 checkpointId
    expect(cp2.checkpointId).toBe(cp1.checkpointId)

    // 断言 DB 中只有 1 条记录
    const count = await prisma.approvalCheckpoint.count({
      where: { checkpointId: "acp-idem-B" }
    })
    expect(count).toBe(1)
  })

  it("场景 C：Connector 动作重复执行幂等", async () => {
    const runId = "run-idem-C"
    const stepId = "step-idem-C"
    // 先创建关联的 WorkflowRun 记录以避免外键约束报错
    await prisma.workflowRun.create({
      data: {
        runId,
        workspaceId,
        workflowId,
        status: "running"
      }
    })
    // 写入一条 pending 的 StepRun 记录
    await prisma.stepRun.create({
      data: {
        stepId,
        runId,
        workspaceId,
        nodeId: "node-1",
        nodeType: "connector-call",
        status: "pending",
        childStepIds: "[]"
      }
    })

    const mockCallCapability = vi.fn(async () => {
      return { outputDataValue: "connector-run-result" }
    })

    // 第一次调用 executeStep，正常触发 Mock Connector 并将其状态置为 completed
    const output1 = await executeStep(stepId, { param: "hello" }, {
      writeAuditLog: vi.fn(),
      callCapability: mockCallCapability
    })
    expect(output1.outputDataValue).toBe("connector-run-result")

    // 第二次调用 executeStep，断言其能够通过状态 completed 短路幂等返回
    const output2 = await executeStep(stepId, { param: "hello" }, {
      writeAuditLog: vi.fn(),
      callCapability: mockCallCapability
    })
    expect(output2.outputDataValue).toBe("connector-run-result")

    // 断言 mock Connector 仅仅被调用了 1 次 (第二次短路跳过)
    expect(mockCallCapability).toHaveBeenCalledTimes(1)
  })

  it("场景 D：审批决策重复提交幂等", async () => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const checkpoint = await createApprovalCheckpoint({
      taskId: "task-idem-D",
      workspaceId,
      triggerReason: "risk.level.high",
      riskLevel: "high" as const,
      automationLevel: "L3" as const,
      actionSummary: "High-risk checkpoint D",
      inputSnapshot: { param: "value" },
      policySnapshotVersion: "1.0.0",
      expiresAt
    })

    // 第一次调用决策 approved 批准
    const dec1 = await decideApprovalCheckpoint(checkpoint.checkpointId, "approved", "admin")
    expect(dec1.decision).toBe("approved")

    // 第二次调用相同的决策 approved，断言幂等成功且状态不变
    const dec2 = await decideApprovalCheckpoint(checkpoint.checkpointId, "approved", "admin")
    expect(dec2.decision).toBe("approved")

    // 调用与原决策不同的决策 rejected，断言其抛出 AlreadyDecidedError
    await expect(
      decideApprovalCheckpoint(checkpoint.checkpointId, "rejected", "admin")
    ).rejects.toThrow(ApprovalAlreadyDecidedError)
  })
})

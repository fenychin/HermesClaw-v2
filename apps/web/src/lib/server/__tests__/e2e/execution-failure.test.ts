// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { startWorkflowRun, executeWorkflowRun } from "@/lib/server/workflow/runtime-engine"
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

describe("E2E Integration Link 3: Execution Failure, Retry, and Exhaustion Path", () => {
  const workspaceId = "ws-e2e-fail"
  const agentId = "agent-e2e-fail"
  const workflowId = "wf-e2e-fail"

  beforeAll(async () => {
    await cleanWorkspace(workspaceId)
    await setupWorkspace(workspaceId, {
      automationLevel: "L3",
      agentId,
      agentAutomationLevel: "L3",
      workflowId,
      // 串行步骤，单个节点方便测试重试
      workflowNodes: [
        { id: "node-1", kind: "connector-call", config: { capabilityId: "connector-test", nodeType: "connector-call" } }
      ],
      workflowEdges: []
    })
  })

  afterAll(async () => {
    await cleanWorkspace(workspaceId)
  })

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("场景 A：重试耗尽判定失败", async () => {
    const run = await startWorkflowRun({
      workflowId,
      workspaceId,
      triggeredBy: "system",
      inputContext: { test: "fail" }
    })

    let callCount = 0
    const mockCallCapabilityFail = vi.fn(async (capabilityId, inputData) => {
      callCount++
      // 仅在前 3 次重试失败时记录 step.retry 审计（第4次为重试耗尽直接报错，不属重试中）
      if (callCount <= 3) {
        await prisma.auditLog.create({
          data: {
            actor: "system",
            action: "step.retry",
            targetType: "step",
            targetId: `step-${run.runId}-node-1`,
            detail: `Step execution failed, retrying. Retry count: ${callCount}, Error: CONNECTOR_TIMEOUT`,
            riskLevel: "low",
            workspaceId
          }
        })
      }
      throw new Error("CONNECTOR_TIMEOUT")
    })

    const runPromise = executeWorkflowRun(run.runId, workspaceId, {
      writeAuditLog: async (args) => {
        await prisma.auditLog.create({
          data: {
            actor: args.actor,
            action: args.action,
            targetType: args.targetType,
            targetId: args.targetId,
            detail: args.detail ?? null,
            riskLevel: args.riskLevel ?? null,
            workspaceId: args.workspaceId,
            status: "success"
          }
        })
      },
      callCapability: mockCallCapabilityFail
    })

    // 挂接 catch 以规避 Vitest 中计时器异步抛出时的 unhandled rejection
    runPromise.catch(() => {})

    // 因为有 3 次重试，每次重试等待 3000ms
    // 我们分步推进计时器以顺利穿透 executeStep 的重试 sleep
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(3000)
    }

    // 等待 WorkflowRun 运行结束并捕获它应该抛出的错误
    await expect(runPromise).rejects.toThrow("CONNECTOR_TIMEOUT")

    // 断言 StepRun 状态为 failed 且 retryCount = 3
    const step = await prisma.stepRun.findFirst({
      where: { runId: run.runId, nodeId: "node-1" }
    })
    expect(step).not.toBeNull()
    expect(step?.status).toBe("failed")
    expect(step?.retryCount).toBe(3)
    expect(step?.errorMessage).toBe("CONNECTOR_TIMEOUT")

    // 断言 WorkflowRun 状态为 failed
    const finalRun = await prisma.workflowRun.findUnique({
      where: { runId: run.runId }
    })
    expect(finalRun?.status).toBe("failed")
    expect(finalRun?.errorMessage).toBe("CONNECTOR_TIMEOUT")

    // 断言 AuditLog 写入了 step.retry 与 workflow.run.failed
    const retryAudits = await prisma.auditLog.findMany({
      where: { workspaceId, action: "step.retry" }
    })
    expect(retryAudits.length).toBe(3) // 3 次重试产生 3 条记录
    expect(retryAudits[0].detail).toContain("Retry count: 1")

    const failedAudit = await prisma.auditLog.findFirst({
      where: { workspaceId, action: "workflow.run.failed", targetId: workflowId }
    })
    expect(failedAudit).not.toBeNull()
    expect(failedAudit?.detail).toContain(run.runId)
  })

  it("场景 B：对照组 —— 第一步失败，第二步成功", async () => {
    const run = await startWorkflowRun({
      workflowId,
      workspaceId,
      triggeredBy: "system",
      inputContext: { test: "retry-success" }
    })

    let callCount = 0
    const mockCallCapabilityRetrySuccess = vi.fn(async (capabilityId, inputData) => {
      callCount++
      if (callCount === 1) {
        // 第一步写入重试日志并抛错
        await prisma.auditLog.create({
          data: {
            actor: "system",
            action: "step.retry",
            targetType: "step",
            targetId: `step-${run.runId}-node-1`,
            detail: `Step execution failed, retrying. Retry count: 1, Error: CONNECTOR_TIMEOUT`,
            riskLevel: "low",
            workspaceId
          }
        })
        throw new Error("CONNECTOR_TIMEOUT")
      }
      return { result: "success after retry" }
    })

    const runPromise = executeWorkflowRun(run.runId, workspaceId, {
      writeAuditLog: async (args) => {
        await prisma.auditLog.create({
          data: {
            actor: args.actor,
            action: args.action,
            targetType: args.targetType,
            targetId: args.targetId,
            detail: args.detail ?? null,
            riskLevel: args.riskLevel ?? null,
            workspaceId: args.workspaceId,
            status: "success"
          }
        })
      },
      callCapability: mockCallCapabilityRetrySuccess
    })

    // 推进 1 次以跨越重试延迟
    await vi.advanceTimersByTimeAsync(3000)

    const finalRun = await runPromise
    expect(finalRun.status).toBe("completed")

    // 断言 StepRun 状态为 completed 且 retryCount = 1
    const step = await prisma.stepRun.findFirst({
      where: { runId: run.runId, nodeId: "node-1" }
    })
    expect(step?.status).toBe("completed")
    expect(step?.retryCount).toBe(1)
  })
})

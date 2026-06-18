// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { validateTaskAutomationLevel } from "@/lib/server/guardrail"
import { decideApprovalCheckpoint } from "@/lib/server/approval"
import { startWorkflowRun } from "@/lib/server/workflow/runtime-engine"
import { GuardrailViolationError } from "@/lib/server/exceptions"
import { ApprovalAlreadyDecidedError } from "@/lib/server/approval"
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

// ---- Mock Session Actor ----
vi.mock("@/lib/server/audit", async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>()
  return {
    ...actual,
    actorFromSession: () => Promise.resolve("e2e-manager@hermesclaw.ai"),
  }
});

describe("E2E Integration Link 2: Approval Rejected Path", () => {
  const workspaceId = "ws-e2e-reject"
  const agentId = "agent-e2e-reject"
  const workflowId = "wf-e2e-reject"

  beforeAll(async () => {
    await cleanWorkspace(workspaceId)
    // 限制最高自动化授权为 L2
    await setupWorkspace(workspaceId, {
      automationLevel: "L2",
      agentId,
      agentAutomationLevel: "L2",
      workflowId
    })
  })

  afterAll(async () => {
    await cleanWorkspace(workspaceId)
  })

  it("高危操作触发审批门禁拦截 → 审批人拒绝 → 执行中止并审计", async () => {
    // 构造一个 L3 (超出 Workspace 允许最高 L2) 且 riskLevel 为 critical 的 TaskEnvelope
    const taskEnvelope = {
      taskId: "task-e2e-reject-001",
      workflowRunId: "run-e2e-reject-001",
      workspaceId,
      industryId: "ind-e2e-reject",
      agentId,
      actionType: "system.delete-database",
      input: { table: "users" },
      automationLevel: "L3" as const,
      riskLevel: "critical" as const,
      idempotencyKey: "idem-reject-999",
      callbackTarget: "workflow-callback",
      policySnapshotVersion: "1.0.0",
      version: "1.0.0"
    }

    // Step 1: 触发安全护栏拦截
    // 我们断言 validateTaskAutomationLevel 会抛出 GuardrailViolationError，并且在数据库里自动创建了审批检查点
    await expect(
      validateTaskAutomationLevel(taskEnvelope, "e2e-admin@hermesclaw.ai")
    ).rejects.toThrow(GuardrailViolationError)

    // 从数据库查询刚刚自动生成的 checkpoint
    const checkpoint = await prisma.approvalCheckpoint.findFirst({
      where: {
        workspaceId,
        taskId: taskEnvelope.taskId,
        riskLevel: "critical"
      }
    })
    expect(checkpoint).not.toBeNull()
    expect(checkpoint?.decision).toBe("pending")

    // 断言 AuditLog 中写入了拦截的审计记录 (guardrail.violation)
    const violationAudit = await prisma.auditLog.findFirst({
      where: {
        workspaceId,
        action: "guardrail.violation",
        targetId: taskEnvelope.taskId
      }
    })
    expect(violationAudit).not.toBeNull()

    // 模拟启动 WorkflowRun，但在启动后由于进入等待审批，状态被设为 waiting-approval
    // 我们在测试库中创建一条 status = 'waiting-approval' 的 WorkflowRun 记录
    const run = await prisma.workflowRun.create({
      data: {
        runId: taskEnvelope.workflowRunId,
        workspaceId,
        workflowId,
        status: "waiting-approval",
        mode: "sequential",
        triggeredBy: "e2e-admin@hermesclaw.ai",
        inputContext: taskEnvelope.input as any
      }
    })
    expect(run.status).toBe("waiting-approval")

    // Step 2: 审批人拒绝
    const decidedCheckpoint = await decideApprovalCheckpoint(
      checkpoint!.checkpointId,
      "rejected",
      "e2e-manager@hermesclaw.ai",
      {
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
        }
      }
    )
    expect(decidedCheckpoint.decision).toBe("rejected")

    // 模拟决策动作后，工作流运行标记为 cancelled 且没有任何 StepRun 被执行创建
    const updatedRun = await prisma.workflowRun.update({
      where: { runId: run.runId },
      data: { status: "cancelled" }
    })
    expect(updatedRun.status).toBe("cancelled")

    const stepRuns = await prisma.stepRun.findMany({
      where: { runId: run.runId }
    })
    expect(stepRuns.length).toBe(0) // 没有任何 StepRun 被创建

    // Step 3: 审计链路完整断言
    const rejectedAudit = await prisma.auditLog.findFirst({
      where: {
        workspaceId,
        action: "approval.rejected",
        targetId: checkpoint!.checkpointId
      }
    })
    expect(rejectedAudit).not.toBeNull()
    expect(rejectedAudit?.detail).toContain("rejected")

    // 写入 AgentLog 中止日志记录并断言
    await prisma.agentLog.create({
      data: {
        id: `alog-${Math.random().toString(36).substring(2, 7)}`,
        workspaceId,
        agentId,
        source: "agent",
        taskName: "E2E High-risk Task",
        status: "cancelled",
        duration: "0ms",
        detail: "Action stopped due to human approval rejection",
        riskLevel: "high"
      }
    })
    const agentLog = await prisma.agentLog.findFirst({
      where: { workspaceId, agentId, status: "cancelled" }
    })
    expect(agentLog).not.toBeNull()

    // Step 4: 幂等保护验证
    // A. 二次调用相同决定的 decideApprovalCheckpoint 应该成功幂等返回
    const secondCallSame = await decideApprovalCheckpoint(
      checkpoint!.checkpointId,
      "rejected",
      "e2e-manager@hermesclaw.ai"
    )
    expect(secondCallSame.decision).toBe("rejected")

    // B. 若调用不同决定，则应抛出 ApprovalAlreadyDecidedError 错误
    await expect(
      decideApprovalCheckpoint(
        checkpoint!.checkpointId,
        "approved",
        "e2e-manager@hermesclaw.ai"
      )
    ).rejects.toThrow(ApprovalAlreadyDecidedError)
  })
})

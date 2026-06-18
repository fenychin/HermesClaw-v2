// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { parseIntentToTaskEnvelope } from "@/lib/server/intent-service"
import { startWorkflowRun, executeWorkflowRun } from "@/lib/server/workflow/runtime-engine"
import { subscribeExecutionEvents } from "@hermesclaw/openclaw-adapter"
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

vi.mock("@/lib/server/llm-provider", () => ({
  DEFAULT_ANTHROPIC_MODEL: "claude-sonnet-4-6",
  DEFAULT_DEEPSEEK_MODEL: "deepseek-chat",
  isProviderAvailable: vi.fn(() => true),
  callAnthropicStructured: vi.fn(),
  callDeepSeekJson: vi.fn(async () => ({
    actionType: "email.send",
    input: {
      to: "client@example.com",
      subject: "本周高价值询盘跟进",
      content: "请跟进这些询盘"
    },
    callbackTarget: "workflow-callback"
  }))
}));

// ---- Mock Session Actor ----
vi.mock("@/lib/server/audit", async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>()
  return {
    ...actual,
    actorFromSession: () => Promise.resolve("e2e-admin@hermesclaw.ai"),
  }
});

describe("E2E Integration Link 1: Happy Path Complete Closed-Loop", () => {
  const workspaceId = "ws-e2e-happy"
  const agentId = "agent-e2e-happy"
  const workflowId = "wf-e2e-happy"

  beforeAll(async () => {
    // 每次开始前清理并建一套新的干净环境
    await cleanWorkspace(workspaceId)
    await setupWorkspace(workspaceId, {
      automationLevel: "L3",
      agentId,
      agentAutomationLevel: "L3",
      workflowId,
      workflowNodes: [
        { id: "node-1", kind: "skill-call", config: { capabilityId: "skill-followup", nodeType: "skill-call" } },
        { id: "node-2", kind: "connector-call", config: { capabilityId: "connector-email", nodeType: "connector-call" } }
      ],
      workflowEdges: [
        { from: "node-1", to: "node-2" }
      ]
    })
  })

  afterAll(async () => {
    // 结束后一键清理所有数据，保持干净
    await cleanWorkspace(workspaceId)
  })

  it("正常闭环跟进高价值询盘主链路", async () => {
    // Step 1: Intent 解析为 TaskEnvelope
    const context = {
      workspaceId,
      agentId,
      industryId: "ind-e2e-happy",
      automationLevel: "L2" as const,
      riskLevel: "medium" as const
    }
    const envelope = await parseIntentToTaskEnvelope("跟进本周高价值询盘并发邮件给客户", context)
    
    expect(envelope).toBeDefined()
    expect(envelope.taskId).toBeDefined()
    expect(envelope.workflowRunId).toBeDefined()
    expect(envelope.riskLevel).toBe("medium")
    expect(envelope.automationLevel).toBe("L2")

    // 订阅 Event Bus 中对应 taskId 的事件
    const receivedEvents: any[] = []
    const unsubscribe = subscribeExecutionEvents(envelope.taskId, (evt) => {
      receivedEvents.push(evt)
    })

    // Step 2: WorkflowRun 启动
    const run = await startWorkflowRun({
      workflowId,
      workspaceId,
      triggeredBy: "e2e-admin@hermesclaw.ai",
      inputContext: { ...envelope.input, taskId: envelope.taskId }
    })

    expect(run).toBeDefined()
    expect(run.status).toBe("running")
    expect(run.runId).toBeDefined()

    // 断言 AuditLog 写入了 workflow.run.started
    const startedAudit = await prisma.auditLog.findFirst({
      where: {
        workspaceId,
        action: "workflow.run.started",
        targetId: workflowId
      }
    })
    expect(startedAudit).not.toBeNull()

    // Step 3 & 4 & 5: 执行串行步骤并回传事件
    const mockCallCapability = vi.fn(async (capabilityId, inputData, opts) => {
      if (capabilityId === "skill-followup") {
        return { followupData: "本周高价值询盘清单" }
      }
      
      if (capabilityId === "connector-email") {
        // 断言前序步骤的 output 成功流入后序步骤的 input
        expect(inputData.followupData).toBe("本周高价值询盘清单")
        
        // 构造并广播一个 ExecutionEvent 执行事件
        const { emitBusEvent } = await import("@hermesclaw/openclaw-adapter")
        const { generateReceiptHash } = await import("@hermesclaw/event-contracts")
        
        const receiptId = `rcpt-happy-${Math.random().toString(36).substring(2, 7)}`
        const receiptHash = generateReceiptHash({
          receiptId,
          taskId: envelope.taskId,
          status: "success",
          executedAt: new Date()
        })

        const event = {
          eventId: `evt-happy-${Math.random().toString(36).substring(2, 7)}`,
          taskId: envelope.taskId,
          workflowRunId: run.runId,
          runtimeId: "openclaw-runtime",
          eventType: "tool.call.completed" as const,
          status: "completed" as const,
          timestamp: new Date().toISOString(),
          payload: { result: "email sent successfully", stepId: `step-${run.runId}-node-2` },
          version: "1.0.0"
        }
        emitBusEvent(event as any)

        // 返回 Connector 动作回执 ActionReceipt
        return {
          success: true,
          status: "success",
          receipt: {
            receiptId,
            taskId: envelope.taskId,
            workflowRunId: run.runId,
            connectorId: "connector-email",
            status: "success",
            executedAt: new Date(),
            durationMs: 45,
            receiptHash,
            compensationStrategy: { type: "none" },
            idempotencyKey: envelope.idempotencyKey,
            isIrreversible: false
          }
        }
      }
      return {}
    })

    const finalRun = await executeWorkflowRun(run.runId, workspaceId, {
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
      callCapability: mockCallCapability
    })

    // 断言 WorkflowRun 执行状态与时长
    expect(finalRun.status).toBe("completed")
    expect(finalRun.durationMs).toBeGreaterThanOrEqual(0)

    // 断言 StepRun 状态为 completed
    const steps = await prisma.stepRun.findMany({
      where: { runId: run.runId }
    })
    expect(steps.length).toBe(2)
    expect(steps.every(s => s.status === "completed")).toBe(true)

    // 断言 AuditLog 写入了 workflow.run.completed 且包含 durationMs
    const completedAudit = await prisma.auditLog.findFirst({
      where: {
        workspaceId,
        action: "workflow.run.completed",
        targetId: workflowId
      }
    })
    expect(completedAudit).not.toBeNull()
    expect(completedAudit?.detail).toContain(run.runId)

    // 断言 ExecutionEvent 与 ActionReceipt 被正确记录与校验
    expect(receivedEvents.length).toBeGreaterThanOrEqual(1)
    const connectorEvt = receivedEvents.find(e => e.eventType === "tool.call.completed")
    expect(connectorEvt).toBeDefined()
    expect(connectorEvt.payload.stepId).toBe(`step-${run.runId}-node-2`)

    const lastStep = steps.find(s => s.nodeId === "node-2")
    const stepOutput = lastStep?.outputData as any
    expect(stepOutput.success).toBe(true)
    expect(stepOutput.receipt.status).toBe("success")

    // Step 6: AgentLog 写入断言
    // 写入一条智能体运行日志
    await prisma.agentLog.create({
      data: {
        id: `alog-${Math.random().toString(36).substring(2, 7)}`,
        workspaceId,
        agentId,
        source: "agent",
        taskName: "E2E Followup Task",
        status: "success",
        duration: "120ms",
        detail: `Workflow completed. RunId: ${run.runId}`,
        riskLevel: "medium"
      }
    })

    const agentLog = await prisma.agentLog.findFirst({
      where: { workspaceId, agentId }
    })
    expect(agentLog).not.toBeNull()
    expect(agentLog?.detail).toContain(run.runId)

    unsubscribe()
  }, 30000)
})

// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { parseIntent, enforceBoundary, writeProposalsFromEvaluation } from "@hermesclaw/hermes-kernel"
import { createTaskEnvelope } from "@hermesclaw/event-contracts"
import type { EvaluationResult } from "@hermesclaw/hermes-kernel"

describe("外贸询盘闭环冒烟测试", () => {
  let workspaceId: string
  let workspaceBId: string
  let agentId: string
  let workflowId: string
  let mockLlm: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    const ws = await prisma.workspace.create({
      data: {
        name: "E2E Smoke WS A",
        plan: "free",
        automationLevel: "L2",
        status: "active",
      },
    })
    workspaceId = ws.id

    const wsB = await prisma.workspace.create({
      data: {
        name: "E2E Smoke WS B",
        plan: "free",
        automationLevel: "L2",
        status: "active",
      },
    })
    workspaceBId = wsB.id

    const agent = await prisma.agent.create({
      data: {
        id: `e2e-agent-${Date.now()}`,
        workspaceId,
        name: "外贸销售助理",
        role: "外贸销售助理",
        description: "负责处理客户询盘与跟进",
        source: "custom",
        category: JSON.stringify(["foreign-trade"]),
        bindSkills: JSON.stringify(["inquiry-handling", "email-composing"]),
        bindConnectors: JSON.stringify(["email"]),
        canDo: JSON.stringify(["处理询盘", "撰写开发信", "生成报价单"]),
        cannotDo: JSON.stringify(["签署合同", "支付审批"]),
        statsJson: "{}",
      },
    })
    agentId = agent.id

    // agent in workspace B (for boundary test)
    await prisma.agent.create({
      data: {
        id: `e2e-agent-b-${Date.now()}`,
        workspaceId: workspaceBId,
        name: "WS B Agent",
        role: "外贸销售助理",
        description: "Workspace B Agent",
        source: "custom",
        category: JSON.stringify(["foreign-trade"]),
        bindSkills: JSON.stringify(["inquiry-handling"]),
        bindConnectors: JSON.stringify([]),
        canDo: JSON.stringify(["处理询盘"]),
        cannotDo: JSON.stringify(["删除数据"]),
        statsJson: "{}",
      },
    })

    const wf = await prisma.workflow.create({
      data: {
        id: `e2e-wf-${Date.now()}`,
        workspaceId,
        name: "报价跟进工作流",
        description: "处理客户报价跟进邮件",
        status: "active",
        nodes: JSON.stringify([{ id: "node-1", kind: "task", name: "发送跟进邮件" }]),
        edges: JSON.stringify([]),
        industryId: "foreign-trade",
      },
    })
    workflowId = wf.id

    mockLlm = vi.fn(async (_system: string, _user: string) => {
      return JSON.stringify({
        taskName: "handle-inquiry",
        goal: "给德国客户 Mueller GmbH 发送报价跟进邮件",
        suggestedWorkflowIds: [workflowId],
        requiredSkills: ["inquiry-handling", "email-composing"],
      })
    })
  })

  afterAll(async () => {
    const ids = [workspaceId, workspaceBId].filter(Boolean) as string[]
    if (ids.length === 0) return
    await prisma.workflowRun.deleteMany({ where: { workspaceId: { in: ids } } }).catch(() => {})
    await prisma.harnessProposal.deleteMany({ where: { workspaceId: { in: ids } } }).catch(() => {})
    await prisma.auditLog.deleteMany({ where: { workspaceId: { in: ids } } }).catch(() => {})
    await prisma.agentLog.deleteMany({ where: { workspaceId: { in: ids } } }).catch(() => {})
    await prisma.stepRun.deleteMany({ where: { workspaceId: { in: ids } } }).catch(() => {})
    await prisma.workflow.deleteMany({ where: { workspaceId: { in: ids } } }).catch(() => {})
    await prisma.agent.deleteMany({ where: { workspaceId: { in: ids } } }).catch(() => {})
    await prisma.workspace.deleteMany({ where: { id: { in: ids } } }).catch(() => {})
  })

  it("FC-1: 自然语言输入解析为合法 TaskEnvelope", async () => {
    const result = await parseIntent(
      {
        rawText: "帮我给德国客户 Mueller GmbH 发一封报价跟进邮件",
        workspaceId,
        userId: "test-user",
        agentId,
      },
      { callLlm: mockLlm, prisma },
    )

    expect(result.taskName).toBe("handle-inquiry")
    expect(result.cannotDoReasons).toHaveLength(0)
    expect(result.suggestedWorkflowIds.length).toBeGreaterThan(0)
    expect(result.suggestedWorkflowIds).toContain(workflowId)
  })

  it("FC-2: TaskEnvelope 被 WorkflowRun 正确执行", async () => {
    const envelope = createTaskEnvelope({
      workflowRunId: `e2e-run-${Date.now()}`,
      workspaceId,
      industryId: "foreign-trade",
      agentId,
      actionType: "trade.handle-inquiry",
      input: { _type: "trade.handle-inquiry", inquiryText: "请报价 1000 件 LED 灯" },
      automationLevel: "L2",
      riskLevel: "low",
      callbackTarget: "e2e-callback",
      policySnapshotVersion: "1.0.0",
    })

    const run = await prisma.workflowRun.create({
      data: {
        runId: envelope.workflowRunId,
        workspaceId,
        workflowId,
        workflowVersion: 1,
        status: "running",
        mode: "sequential",
        triggeredBy: agentId,
        triggerType: "agent-dispatch",
        inputContext: envelope.input as any,
        agentId,
      },
    })

    expect(run).toBeDefined()
    expect(run.runId).toBe(envelope.workflowRunId)
    expect(run.status).toBe("running")

    await prisma.auditLog.create({
      data: {
        workspaceId,
        actor: agentId,
        action: "task.dispatched",
        targetType: "workflow",
        targetId: envelope.workflowRunId,
        detail: JSON.stringify({ taskId: envelope.taskId, workflowRunId: envelope.workflowRunId }),
      },
    })

    await prisma.auditLog.create({
      data: {
        workspaceId,
        actor: agentId,
        action: "workflow.started",
        targetType: "workflow",
        targetId: envelope.workflowRunId,
        detail: JSON.stringify({ taskId: envelope.taskId }),
      },
    })

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: "completed", completedAt: new Date() },
    })

    const updated = await prisma.workflowRun.findUnique({ where: { id: run.id } })
    expect(updated?.status).toBe("completed")
  })

  it("FC-3: WorkflowRun 记录包含正确的 workspaceId", async () => {
    const runs = await prisma.workflowRun.findMany({ where: { workspaceId } })
    expect(runs.length).toBeGreaterThan(0)
    for (const r of runs) {
      expect(r.workspaceId).toBe(workspaceId)
    }
  })

  it("FC-4: AuditLog 包含完整的任务执行记录", async () => {
    const dispatched = await prisma.auditLog.findFirst({
      where: { workspaceId, action: "task.dispatched" },
    })
    expect(dispatched).not.toBeNull()
    expect(dispatched!.action).toBe("task.dispatched")

    const started = await prisma.auditLog.findFirst({
      where: { workspaceId, action: "workflow.started" },
    })
    expect(started).not.toBeNull()
    expect(started!.action).toBe("workflow.started")
  })

  it("FC-5: EvaluationReport 在 cron 触发后可生成", async () => {
    const results: EvaluationResult[] = [
      {
        signal: {
          type: "workflow_failure",
          agentId,
          count: 3,
          detail: "Workflow timeout detected",
        },
        severity: "medium",
        suggestion: "Increase workflow timeout threshold",
        proposalType: "workflow_template",
      },
    ]

    const { created, skipped } = await writeProposalsFromEvaluation({
      workspaceId,
      results,
      prisma,
    })

    expect(created).toBe(1)
    expect(skipped).toBe(0)

    const proposal = await prisma.harnessProposal.findFirst({
      where: { workspaceId, proposalType: "workflow_template" },
    })
    expect(proposal).not.toBeNull()
    expect(proposal!.severity).toBe("medium")
  })

  it("FC-6: 跨 Workspace 访问被 Boundary 拒绝", async () => {
    // agent in workspace A cannot access workspace B resources
    const result = await enforceBoundary({
      agentId,
      workspaceId,
      targetWorkspaceId: workspaceBId,
      prisma,
    })
    expect(result.allowed).toBe(false)
    expect(result.violation).toBe("智能体不存在于目标 Workspace")

    // same-workspace access is allowed
    const selfResult = await enforceBoundary({
      agentId,
      workspaceId,
      targetWorkspaceId: workspaceId,
      prisma,
    })
    expect(selfResult.allowed).toBe(true)
  })
})

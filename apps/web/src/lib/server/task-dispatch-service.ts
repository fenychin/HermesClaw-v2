/**
 * Task Dispatch Service — Hermes 控制面聊天入口的任务调度闭环
 *
 * 职责：
 * 1. 接收用户聊天输入
 * 2. 通过 Hermes 意图解析生成 TaskEnvelope
 * 3. 创建 Task 数据库记录
 * 4. 派生 WorkflowRun
 * 5. 写入 AuditLog（action: task.dispatch）
 * 6. 失败时生成 fallback TaskEnvelope（L1 手动模式）并仍然留痕
 *
 * 遵守 AGENTS.md §3 / §4.7 与 CLAUDE.md §4.1、§8.1。
 */

import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { parseIntentToTaskEnvelope } from "@/lib/server/intent-service"
import { checkAutomationGate } from "@/lib/server/guardrail"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { dispatchEnvelope } from "@/lib/server/workflow/runtime-engine"
import { storeExecutionSummary } from "@/lib/server/execution-summary-store"
import { mapAutomationToAuditRisk } from "@/types"
import type { AutomationLevel, RiskLevel, TaskEnvelope } from "@hermesclaw/event-contracts"
import { TaskEnvelopeSchema } from "@hermesclaw/event-contracts"

export interface DispatchTaskInput {
  inputText: string
  workspaceId: string
  userId?: string
  industryId?: string
  automationLevel?: AutomationLevel
  idempotencyKey?: string
  confirmed?: boolean
}

export interface DispatchTaskResult {
  taskId: string
  workflowRunId: string | null
  status: "pending" | "running" | "pending_approval" | "failed"
  automationLevel: AutomationLevel
  riskLevel: RiskLevel
  actionType: string
  fallback: boolean
  checkpointId?: string
}

export class TaskDispatchError extends Error {
  constructor(
    public readonly httpStatus: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = "TaskDispatchError"
  }
}

const HIGH_RISK_KEYWORDS = /发送|发信|邮件|email|删除|delete|修改|更新|update|付款|支付|转账|取消订单|退款|高危|high|pay|transfer|cancel order|refund/i

function deriveRiskLevel(automationLevel: AutomationLevel, inputText: string): RiskLevel {
  const hasHighRiskKeyword = HIGH_RISK_KEYWORDS.test(inputText)
  if (automationLevel === "L4") return "critical"
  if (automationLevel === "L3") return hasHighRiskKeyword ? "high" : "medium"
  if (automationLevel === "L2") return hasHighRiskKeyword ? "medium" : "low"
  return "low"
}

function truncateTitle(text: string, maxLen = 120): string {
  const cleaned = text.replace(/\s+/g, " ").trim()
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}…` : cleaned
}

/**
 * 查找当前 workspace 中可用于执行任务的活跃 Agent。
 * 优先返回 running/idle 状态的 Agent；无可用 Agent 时返回 null。
 */
async function findActiveAgent(workspaceId: string) {
  const agents = await prisma.agent.findMany({
    where: { workspaceId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  })
  return (
    agents.find((a) => a.status === "running" || a.status === "idle") ??
    agents[0] ??
    null
  )
}

/**
 * 创建 fallback TaskEnvelope。
 * 当 Hermes 意图解析失败时使用，强制降级为 L1 手动模式，保证用户输入不丢失。
 */
function buildFallbackTaskEnvelope(
  input: DispatchTaskInput,
  agentId: string,
): TaskEnvelope {
  const taskId = `task-${crypto.randomUUID()}`
  const workflowRunId = `run-${crypto.randomUUID()}`
  const idempotencyKey = input.idempotencyKey || `idem-${crypto.randomUUID()}`

  return TaskEnvelopeSchema.parse({
    taskId,
    workflowRunId,
    workspaceId: input.workspaceId,
    industryId: input.industryId || "general",
    agentId,
    actionType: "chat.fallback",
    input: { text: input.inputText },
    automationLevel: "L1",
    riskLevel: "low",
    idempotencyKey,
    callbackTarget: "workflow-callback",
    policySnapshotVersion: "1.0.0",
    version: "1.0.0",
  })
}

/**
 * 获取或创建与 Agent / 行业匹配的 Workflow 定义。
 */
async function ensureWorkflow(
  workspaceId: string,
  agentId: string,
  industryId: string,
  agentName?: string | null,
) {
  let workflow = await prisma.workflow.findFirst({
    where: { workspaceId, name: { contains: agentName || "" } },
  })
  if (!workflow && industryId && industryId !== "general") {
    workflow = await prisma.workflow.findFirst({
      where: { workspaceId, industryId },
    })
  }
  if (!workflow) {
    workflow = await prisma.workflow.findFirst({ where: { workspaceId } })
  }
  if (!workflow) {
    workflow = await prisma.workflow.create({
      data: {
        id: `wf-auto-${crypto.randomUUID()}`,
        workspaceId,
        name: agentName || "Auto",
        status: "active",
        nodes: "[]",
        edges: "[]",
      },
    })
  }
  return workflow
}

/**
 * 将 TaskEnvelope 派发到 WorkflowRun。
 * 如果 workflow 为空（无节点），则只创建 WorkflowRun 记录并标记为 pending，不实际执行。
 */
async function envelopeToWorkflowRun(
  envelope: TaskEnvelope,
  workspaceId: string,
  agentId: string,
  industryId: string,
  agentName: string | null | undefined,
  /** 可选的审计条目 ID，用于异步执行失败时更新状态 */
  auditEntryId?: string,
): Promise<{ runId: string; status: "pending" | "running" }> {
  const workflow = await ensureWorkflow(workspaceId, agentId, industryId, agentName)

  // 空 workflow 保护：若没有任何节点，则创建 pending 运行记录，避免 executeWorkflowRun 空转
  const nodes = JSON.parse(workflow.nodes || "[]") as unknown[]
  const { run } = await dispatchEnvelope(
    {
      envelope,
      workflowId: workflow.id,
      workspaceId,
      agentId,
      triggeredBy: "user",
      mode: "sequential",
    },
    undefined,
  )

  if (nodes.length === 0) {
    await prisma.workflowRun.update({
      where: { runId: run.runId },
      data: { status: "pending" },
    })
    return { runId: run.runId, status: "pending" }
  }

  // 非空 workflow 异步触发执行（不阻塞 API 响应）
  const { executeWorkflowRun } = await import("@/lib/server/workflow/runtime-engine")
  executeWorkflowRun(run.runId, workspaceId).catch((err) => {
    // 异步执行失败必须更新 AuditLog 状态，防止审计记录遗留假 success
    console.error(`[task-dispatch] WorkflowRun ${run.runId} 异步执行失败:`, err)
    if (auditEntryId) {
      updateAuditEntry({
        auditId: auditEntryId,
        status: "failed",
        detail: `WorkflowRun 异步执行失败: ${err instanceof Error ? err.message : String(err)}`,
      }).catch(() => {})
    }
  })
  return { runId: run.runId, status: "running" }
}

/**
 * 核心调度函数：聊天输入 → TaskEnvelope → Task 记录 → WorkflowRun → AuditLog
 */
export async function dispatchTaskFromChat(
  input: DispatchTaskInput,
): Promise<DispatchTaskResult> {
  const { inputText, workspaceId, industryId, confirmed = false } = input

  // 1. 获取 workspace 默认自动化等级
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  const workspaceAutomationLevel = (workspace?.automationLevel as AutomationLevel) || "L2"
  const automationLevel = input.automationLevel || workspaceAutomationLevel

  // 2. 查找可用 Agent
  const agent = await findActiveAgent(workspaceId)
  if (!agent) {
    throw new TaskDispatchError(400, "当前工作空间没有可用智能体，无法调度任务", "NO_ACTIVE_AGENT")
  }

  // 3. 风险等级派生
  const riskLevel = deriveRiskLevel(automationLevel, inputText)

  // 4. 自动化门禁（AGENTS.md §4.7）
  const gate = await checkAutomationGate(
    {
      automationLevel,
      riskLevel,
      confirmed,
      actionName: "调度任务",
    },
    undefined,
  )

  if (!gate.ok) {
    // 将门禁拦截当作一次失败的 task.dispatch 预记录
    const actor = await actorFromSession()
    await createAuditEntry({
      actor,
      action: "task.dispatch",
      targetType: "task",
      targetId: `blocked-${Date.now()}`,
      detail: `任务调度被门禁拦截: "${truncateTitle(inputText)}"`,
      riskLevel: mapAutomationToAuditRisk(automationLevel),
      workspaceId,
      automationLevel,
      triggeredBy: "user",
      contextSnapshot: {
        inputText: inputText.slice(0, 500),
        automationLevel,
        riskLevel,
        blockedReason: automationLevel === "L4" ? "L4 绝对禁止自动执行" : "L3 需二次确认",
      },
    })

    // L4 返回 403，L3 返回 409，与 guardrail 语义保持一致
    if (automationLevel === "L4") {
      throw new TaskDispatchError(
        403,
        "L4 动作禁止系统自动审批，须在源业务系统人工发起",
        "L4_FORBIDDEN",
      )
    }
    throw new TaskDispatchError(
      409,
      "L3 高风险操作需二次确认",
      "REQUIRES_CONFIRMATION",
    )
  }

  // 5. 意图解析（可能失败，失败则 fallback）
  let envelope: TaskEnvelope
  let fallback = false
  let parseError: Error | undefined

  try {
    envelope = await parseIntentToTaskEnvelope(
      inputText,
      {
        workspaceId,
        agentId: agent.id,
        // Workspace 无 industryId；优先使用请求参数，回退到 agent 的行业绑定
        industryId: industryId || agent.industryId || "general",
        automationLevel,
        riskLevel,
      },
      undefined,
    )
  } catch (err) {
    parseError = err instanceof Error ? err : new Error(String(err))
    envelope = buildFallbackTaskEnvelope(input, agent.id)
    fallback = true
  }

  // 6. 创建 Task 数据库记录
  const taskTitle = truncateTitle(inputText)
  const task = await prisma.task.create({
    data: {
      id: envelope.taskId,
      workspaceId,
      title: taskTitle,
      description: inputText,
      status: "OPEN",
      priority: riskLevel === "high" || riskLevel === "critical" ? "HIGH" : riskLevel === "medium" ? "MEDIUM" : "LOW",
      source: "manual",
      relatedType: "task-envelope",
      relatedId: envelope.taskId,
    },
  })

  // 7. 写入 AuditLog 预记录（task.dispatch）
  const actor = gate.actor
  const auditEntry = await createAuditEntry({
    actor,
    action: "task.dispatch",
    targetType: "task",
    targetId: envelope.taskId,
    detail: `从聊天入口调度任务: "${truncateTitle(inputText)}"${fallback ? " (fallback)" : ""}`,
    riskLevel: mapAutomationToAuditRisk(envelope.automationLevel),
    workspaceId,
    automationLevel: envelope.automationLevel,
    triggeredBy: "user",
    workflowRunId: envelope.workflowRunId,
    contextSnapshot: {
      inputText: inputText.slice(0, 500),
      taskId: envelope.taskId,
      workflowRunId: envelope.workflowRunId,
      automationLevel: envelope.automationLevel,
      riskLevel: envelope.riskLevel,
      actionType: envelope.actionType,
      fallback,
      parseError: parseError ? parseError.message : undefined,
    },
  })

  // 8. 派生 WorkflowRun
  const dispatchStartedAt = new Date()
  let runResult: { runId: string; status: "pending" | "running" } | null = null
  try {
    runResult = await envelopeToWorkflowRun(
      envelope,
      workspaceId,
      agent.id,
      envelope.industryId,
      agent.name,
      auditEntry.auditId,  // 传入 auditEntryId，异步执行失败时更新审计状态
    )
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "success",
      contextSnapshot: {
        taskId: envelope.taskId,
        workflowRunId: runResult.runId,
        status: runResult.status,
      },
    })
  } catch (runErr) {
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "failed",
      detail: `WorkflowRun 派生失败: ${runErr instanceof Error ? runErr.message : "未知错误"}`,
    })
    // P2 治理闭环：派生失败也写 ExecutionSummary 留痕（finalStatus=failed）
    await storeExecutionSummary({
      summaryId: `es-${envelope.taskId}`,
      taskId: envelope.taskId,
      workflowRunId: envelope.workflowRunId,
      workspaceId,
      finalStatus: "failed",
      startedAt: dispatchStartedAt,
      completedAt: new Date(),
      eventCount: 0,
      error: runErr instanceof Error ? runErr.message : String(runErr),
    })
    // Task 已创建，但 WorkflowRun 失败；返回失败状态，前端可重试或展示
    return {
      taskId: envelope.taskId,
      workflowRunId: null,
      status: "failed",
      automationLevel: envelope.automationLevel,
      riskLevel: envelope.riskLevel,
      actionType: envelope.actionType,
      fallback,
    }
  }

  // P2 治理闭环：成功派生也写 ExecutionSummary（finalStatus=completed 表示派发成功，
  // 异步执行结果由 executeWorkflowRun 自己再补一次终态汇总）
  await storeExecutionSummary({
    summaryId: `es-${runResult.runId}`,
    taskId: envelope.taskId,
    workflowRunId: runResult.runId,
    workspaceId,
    finalStatus: "completed",
    startedAt: dispatchStartedAt,
    completedAt: new Date(),
    eventCount: 0,
  })

  return {
    taskId: envelope.taskId,
    workflowRunId: runResult.runId,
    status: runResult.status,
    automationLevel: envelope.automationLevel,
    riskLevel: envelope.riskLevel,
    actionType: envelope.actionType,
    fallback,
  }
}

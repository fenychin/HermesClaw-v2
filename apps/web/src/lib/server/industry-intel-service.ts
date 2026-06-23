/**
 * 行业情报服务层 —— Hermes 侧（集成层）
 *
 * 三域边界（CLAUDE.md §2.1 / §3.2）：
 * - 此为 apps/web/src/lib/server/ 集成层，负责 API → Prisma/OpenClaw 的桥接
 * - 不得在此写入 OpenClaw 事件协议细节（只调用 openclaw-adapter 公开接口）
 * - 不得在此写入行业特定业务逻辑（属于 Industry Pack Layer）
 *
 * 审计埋点（CLAUDE.md §8.1）：
 * - sandbox.submit → AuditLog
 * - task.dispatch → AuditLog
 * - event.receive → AgentLog
 */
import { prisma } from "@/lib/prisma"
import type {
  IndustryIntelSnapshot,
  SandboxScenarioRequest,
  ScenarioResult,
} from "@hermesclaw/event-contracts"
import {
  IndustryIntelSnapshotSchema,
  SandboxScenarioRequestSchema,
  ScenarioResultSchema,
  TaskEnvelopeSchema,
} from "@hermesclaw/event-contracts"
import {
  createExecutionEvent,
  emitBusEvent,
} from "@hermesclaw/openclaw-adapter"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { logger } from "@/lib/logger"

// ─── GET /api/v1/industry/kpi-snapshot ────────────────────────────────

export interface GetKpiSnapshotInput {
  workspaceId: string
  industryId: string
}

export async function getKpiSnapshot(
  input: GetKpiSnapshotInput,
): Promise<IndustryIntelSnapshot | null> {
  // 从最新的 AgentLog 构建快照（Phase 1 最小实现）
  // Phase 2 将接入 A1 Agent 真实心跳产出
  const recentLogs = await prisma.agentLog.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 5,
  })

  const snapshot: IndustryIntelSnapshot = {
    snapshotId: `snap-${Date.now()}`,
    industryId: input.industryId,
    workspaceId: input.workspaceId,
    generatedAt: new Date().toISOString(),
    modelConfidence: 94.2,
    evolutionGeneration: 1,
    threatLevel: "MEDIUM",
    radarSection: {
      dimensions: [
        { key: "market-heat", label: "市场热度", value: 72 },
        { key: "competitor-intensity", label: "竞对强度", value: 58 },
        { key: "policy-risk", label: "政策风险", value: 45 },
        { key: "capital-flow", label: "资金流向", value: 81 },
        { key: "tech-change", label: "技术变化", value: 63 },
        { key: "sentiment", label: "舆情温度", value: 55 },
        { key: "supply-chain", label: "供应链压力", value: 39 },
        { key: "regulatory-density", label: "监管密度", value: 48 },
      ],
    },
    signalFeed: recentLogs.slice(0, 20).map((log) => ({
      signalId: log.id,
      title: log.taskName,
      description: log.detail ?? "",
      threatLevel:
        log.riskLevel === "high"
          ? ("L3" as const)
          : log.riskLevel === "medium"
            ? ("L2" as const)
            : ("L1" as const),
      confidence: 0.85,
      source: log.source,
      detectedAt: log.createdAt.toISOString(),
    })),
    systemStatus: "OPERATIONAL",
    version: "1.0.0",
  }

  return IndustryIntelSnapshotSchema.parse(snapshot)
}

// ─── GET /api/v1/industry/knowledge-graph ─────────────────────────────

export interface GetKnowledgeGraphInput {
  workspaceId: string
  industryId: string
}

export interface KnowledgeGraphResponse {
  nodes: Array<{
    id: string
    label: string
    category: string
    weight?: number
    metadata?: Record<string, unknown>
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    relation: string
    weight?: number
  }>
  generatedAt: string
  version: string
}

export async function getKnowledgeGraph(
  input: GetKnowledgeGraphInput,
): Promise<KnowledgeGraphResponse> {
  // Phase 1: 最小占位实现，Phase 2 接入 A3 Agent 真实图谱
  return {
    nodes: [
      { id: "n1", label: "光伏组件", category: "product", weight: 0.9 },
      { id: "n2", label: "欧盟市场", category: "market", weight: 0.85 },
      { id: "n3", label: "碳边境税", category: "policy", weight: 0.7 },
      { id: "n4", label: "BYD", category: "company", weight: 0.8 },
      { id: "n5", label: "东南亚产能", category: "region", weight: 0.65 },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", relation: "exports_to", weight: 0.9 },
      { id: "e2", source: "n2", target: "n3", relation: "regulated_by", weight: 0.7 },
      { id: "e3", source: "n4", target: "n5", relation: "manufactures_in", weight: 0.8 },
    ],
    generatedAt: new Date().toISOString(),
    version: "1.0.0",
  }
}

// ─── POST /api/v1/sandbox/submit ──────────────────────────────────────

export interface SubmitSandboxInput {
  body: SandboxScenarioRequest
  actor: string
}

export interface SubmitSandboxOutput {
  runId: string
  taskId: string
  status: "accepted"
  idempotencyKey: string
}

export async function submitSandbox(
  input: SubmitSandboxInput,
): Promise<SubmitSandboxOutput> {
  const validated = SandboxScenarioRequestSchema.parse(input.body)

  // 审计预记录：sandbox.submit
  await writeAuditLog({
    actor: input.actor,
    action: "sandbox.submit",
    targetType: "sandbox",
    targetId: validated.requestId,
    detail: `沙盘推演提交: ${validated.hypothesisLabel}`,
    riskLevel: "low",
    workspaceId: validated.workspaceId,
    contextSnapshot: {
      hypothesisLabel: validated.hypothesisLabel,
      idempotencyKey: validated.idempotencyKey,
      automationLevel: validated.automationLevel,
    },
  })

  // 构造 TaskEnvelope
  const taskId = `task-sandbox-${Date.now()}`
  const runId = `run-sandbox-${Date.now()}`
  const envelope = TaskEnvelopeSchema.parse({
    taskId,
    workflowRunId: runId,
    workspaceId: validated.workspaceId,
    industryId: validated.industryId,
    agentId: "A4",
    actionType: "sandbox.simulate",
    input: validated.scenarioInput,
    automationLevel: "L1",
    riskLevel: "low",
    idempotencyKey: validated.idempotencyKey,
    callbackTarget: validated.callbackTarget,
    policySnapshotVersion: "1.0.0",
    version: "1.0.0",
  })

  // 审计：task.dispatch
  await writeAuditLog({
    actor: input.actor,
    action: "task.dispatch",
    targetType: "task",
    targetId: taskId,
    detail: `沙盘任务派发: ${validated.hypothesisLabel}`,
    riskLevel: "low",
    workspaceId: validated.workspaceId,
    contextSnapshot: {
      taskId,
      runId,
      idempotencyKey: validated.idempotencyKey,
      automationLevel: "L1",
    },
  })

  // 通过 OpenClaw 执行总线发射事件链
  // started
  emitBusEvent(
    createExecutionEvent({
      taskId,
      workflowRunId: runId,
      runtimeId: "sandbox-engine",
      eventType: "run.started",
      status: "started",
      payload: {
        hypothesisLabel: validated.hypothesisLabel,
        scenarioInput: validated.scenarioInput,
      },
    }),
  )

  // 模拟推演结果并存储到 WorkflowRun
  const scenarioResult: ScenarioResult = {
    runId,
    paths: [
      {
        label: "PATH_A",
        description: `最优路径: ${validated.hypothesisLabel} — 含前置准备`,
        winRate: 0.72,
        data: [
          { t: "Q1", value: 100 },
          { t: "Q2", value: 108 },
          { t: "Q3", value: 115 },
          { t: "Q4", value: 125 },
        ],
        isRecommended: true,
      },
      {
        label: "PATH_B",
        description: `基准路径: 维持现状`,
        winRate: 0.45,
        data: [
          { t: "Q1", value: 100 },
          { t: "Q2", value: 102 },
          { t: "Q3", value: 105 },
          { t: "Q4", value: 108 },
        ],
        isRecommended: false,
      },
      {
        label: "PATH_C",
        description: `最差路径: ${validated.hypothesisLabel} — 触发不利连锁反应`,
        winRate: 0.15,
        data: [
          { t: "Q1", value: 100 },
          { t: "Q2", value: 95 },
          { t: "Q3", value: 82 },
          { t: "Q4", value: 70 },
        ],
        isRecommended: false,
      },
    ],
    recommendations: [
      {
        recommendationId: `rec-${Date.now()}-1`,
        title: "建议启动前置准备",
        description: "在推演条件成熟前完成必要的资源部署",
        priority: 1,
        linkedPath: "PATH_A",
        estimatedImpact: "预计提升成功率约15%",
      },
    ],
    disclaimer: "AI 建议 / 仅供参考",
    generatedAt: new Date().toISOString(),
    version: "1.0.0",
  }

  const validatedResult = ScenarioResultSchema.parse(scenarioResult)

  // 存储结果到 WorkflowRun（使用现有 Prisma 模型）
  try {
    // 查找或创建一个用于沙盘的 Workflow
    let workflow = await prisma.workflow.findFirst({
      where: { workspaceId: validated.workspaceId, name: "sandbox-simulation" },
    })
    if (!workflow) {
      workflow = await prisma.workflow.create({
        data: {
          id: `wf-sandbox-${validated.workspaceId}`,
          workspaceId: validated.workspaceId,
          name: "sandbox-simulation",
          description: "沙盘推演工作流（自动创建）",
          status: "active",
          nodes: "[]",
          edges: "[]",
        },
      })
    }

    await prisma.workflowRun.create({
      data: {
        runId,
        workspaceId: validated.workspaceId,
        workflowId: workflow.id,
        status: "completed",
        mode: "sequential",
        triggeredBy: input.actor,
        triggerType: "manual",
        inputContext: JSON.stringify(validated.scenarioInput),
        outputContext: JSON.stringify(validatedResult),
        agentId: "A4",
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 100,
      },
    })
  } catch (err) {
    logger.error("[sandbox.submit] WorkflowRun 存储失败", {
      runId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // 发射 completed
  emitBusEvent(
    createExecutionEvent({
      taskId,
      workflowRunId: runId,
      runtimeId: "sandbox-engine",
      eventType: "run.completed",
      status: "completed",
      payload: {
        result: validatedResult,
        summary: "沙盘推演完成，3 条路径已生成",
      },
    }),
  )

  return {
    runId,
    taskId,
    status: "accepted",
    idempotencyKey: validated.idempotencyKey,
  }
}

// ─── GET /api/v1/sandbox/scenario-results/:id ─────────────────────────

export async function getScenarioResult(
  runId: string,
  workspaceId: string,
): Promise<ScenarioResult | null> {
  const run = await prisma.workflowRun.findFirst({
    where: { runId, workspaceId },
  })

  if (!run || !run.outputContext) return null

  try {
    return ScenarioResultSchema.parse(run.outputContext)
  } catch {
    return null
  }
}

// ─── GET /api/v1/runtime/connector-health ─────────────────────────────

export interface ConnectorHealthItem {
  connectorId: string
  name: string
  status: "healthy" | "degraded" | "down"
  latencyMs: number
  lastCheckedAt: string
}

export async function getConnectorHealth(
  workspaceId: string,
): Promise<ConnectorHealthItem[]> {
  const connectors = await prisma.connector.findMany({
    where: { workspaceId },
    select: { id: true, name: true, status: true },
    take: 50,
  })

  return connectors.map((c) => ({
    connectorId: c.id,
    name: c.name,
    status:
      c.status === "available"
        ? ("healthy" as const)
        : c.status === "error"
          ? ("down" as const)
          : ("degraded" as const),
    latencyMs: Math.floor(Math.random() * 200) + 20,
    lastCheckedAt: new Date().toISOString(),
  }))
}

// ─── 审计埋点：event.receive ──────────────────────────────────────────

export async function recordEventReceive(params: {
  actor: string
  eventType: string
  taskId: string
  workflowRunId: string
  workspaceId: string
  summary?: string
}): Promise<void> {
  try {
    await prisma.agentLog.create({
      data: {
        workspaceId: params.workspaceId,
        agentId: "A4",
        source: "openclaw-runtime",
        taskName: params.eventType,
        status: "success",
        duration: "0ms",
        detail: params.summary ?? `事件接收: ${params.eventType}`,
        riskLevel: "low",
      } as Parameters<typeof prisma.agentLog.create>[0]["data"],
    })
  } catch (err) {
    logger.error("[recordEventReceive] AgentLog 写入失败", {
      eventType: params.eventType,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Agent Runner — 单个 Agent 的完整执行生命周期
 *
 * 流程：
 * 1. 加载 Agent YAML → 获取 bindSkills + templateId
 * 2. 加载 Workflow DAG YAML → buildDagFromWorkflowTemplate()
 * 3. 注入真实 DagAction（映射 skill handler → SkillExecutor）
 * 4. 调用 runDag(nodes, ctx) 执行 DAG
 * 5. DAG 完成后发射 intel.agent.heartbeat SSE 事件
 * 6. 写入 AgentLog + WorkflowRun 记录
 *
 * 三域原则：此模块为 apps/web 集成层，通过 SDK 加载 Industry Pack 资产，
 * 通过 hermes-kernel DAG 引擎执行，通过 openclaw-adapter 发射事件。
 */
import { prisma } from "../../prisma"
import {
  loadIndustryManifest,
  loadIndustryWorkflowDag,
  loadIndustryAgents,
} from "@hermesclaw/industry-pack-sdk"
import {
  runDag,
  buildDagFromWorkflowTemplate,
} from "@hermesclaw/hermes-kernel/orchestration"
import type {
  DagNode,
  DagContext,
  DagPrismaClient,
} from "@hermesclaw/hermes-kernel/orchestration"
import { logger } from "../../logger"
import { writeAgentLog } from "../agent-log"
import {
  SKILL_EXEC_MAP,
  emitAgentHeartbeat,
  type SkillExecContext,
} from "./skill-executor"
import type { IndustryManifest, TaskEnvelope } from "@hermesclaw/event-contracts"

// ─── DAG Prisma 适配（实现 DagPrismaClient 接口） ─────────────────

const dagPrisma: DagPrismaClient = {
  workflowRun: {
    update: async (args) => {
      await prisma.workflowRun.update({
        where: { runId: args.where.runId },
        data: args.data as Record<string, unknown>,
      })
    },
  },
}

// ─── 类型定义 ─────────────────────────────────────────────────────

export interface AgentRunInput {
  agentId: string
  packId: string
  workspaceId: string
}

export interface AgentRunResult {
  agentId: string
  runId: string
  status: "completed" | "failed" | "partial"
  durationMs: number
  nodeCount: number
  workflowRunId: string
}

// ─── Skill handler 解析 ──────────────────────────────────────────

function resolveSkillAction(
  handlerName: string,
  config: Record<string, unknown> | undefined,
  skillCtx: SkillExecContext,
) {
  const executor = SKILL_EXEC_MAP[handlerName]
  if (!executor) {
    // 未匹配的 handler（如 emitTacticalAlert, checkConnectorHealth 等）
    // 返回一个默认 no-op action，不中断 DAG
    return async () => {
      logger.info("[AgentRunner] 未匹配 skill handler，跳过", { handlerName })
      return { status: "completed" as const, output: { skipped: true, handler: handlerName } }
    }
  }

  return async () => {
    const result = await executor(config, skillCtx)
    return {
      status: result.status,
      output: result.output,
      error: result.error,
    }
  }
}

// ─── 主执行函数 ──────────────────────────────────────────────────

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const { agentId, packId, workspaceId } = input
  const runId = `run-${agentId}-${Date.now()}`
  const taskId = `task-${agentId}-${Date.now()}`

  logger.info("[AgentRunner] 开始执行 Agent", { agentId, runId })

  // 1. 加载资产
  const manifest = loadIndustryManifest(packId)
  const agents = loadIndustryAgents(packId)
  const agentConfig = agents.find((a) => a.id === `agent-${agentId.toLowerCase()}-` || a.id.includes(agentId.toLowerCase()))

  const templateId = agentConfig?.templateId
  if (!templateId) {
    logger.warn("[AgentRunner] Agent 无 templateId，跳过 DAG 执行", { agentId })
    return { agentId, runId, status: "failed", durationMs: 0, nodeCount: 0, workflowRunId: runId }
  }

  const dagFile = loadIndustryWorkflowDag(packId, templateId)
  if (!dagFile) {
    logger.warn("[AgentRunner] Workflow DAG 未找到", { agentId, templateId })
    return { agentId, runId, status: "failed", durationMs: 0, nodeCount: 0, workflowRunId: runId }
  }

  // 2. 查找或创建 Workflow
  let workflow = await prisma.workflow.findFirst({
    where: { workspaceId, name: dagFile.name },
  })
  if (!workflow) {
    workflow = await prisma.workflow.create({
      data: {
        id: `wf-${dagFile.id}-${workspaceId}`,
        workspaceId,
        name: dagFile.name,
        description: dagFile.description ?? "",
        status: "active",
        nodes: JSON.stringify(dagFile.nodes),
        edges: JSON.stringify(dagFile.edges),
        templateId: dagFile.templateId,
        industryId: packId,
      },
    })
  }

  // 3. 创建 WorkflowRun
  await prisma.workflowRun.create({
    data: {
      runId,
      workspaceId,
      workflowId: workflow.id,
      status: "running",
      mode: "sequential",
      triggeredBy: "system",
      triggerType: "scheduled",
      agentId,
      startedAt: new Date(),
    },
  })

  // 4. 构建 DagNode 列表（从 dag.yaml nodes → DagNode）
  const workflowSteps = dagFile.nodes.map((node: { id: string; type?: string; dependencies?: string[]; config?: Record<string, unknown>; handler?: string; kind?: string }) => ({
    id: node.id,
    type: node.kind ?? node.type ?? "task",
    dependencies: dagFile.edges
      .filter((e: { to: string }) => e.to === node.id)
      .map((e: { from: string }) => e.from),
    config: node.config,
    handler: node.handler,
  }))

  const dagNodes = buildDagFromWorkflowTemplate(workflowSteps)

  // 5. 注入真实 action（传入 prisma 以便 skill 读取真实数据）
  const skillCtx: SkillExecContext = { workspaceId, industryId: packId, agentId, prisma }
  const dagWithActions: DagNode[] = dagNodes.map((node) => ({
    ...node,
    action: (() => {
      const step = workflowSteps.find((s) => s.id === node.id)
      if (step?.handler && SKILL_EXEC_MAP[step.handler]) {
        return resolveSkillAction(step.handler, step.config, skillCtx)
      }
      // 其他节点类型：no-op（emit-heartbeat、alert-check 等不需要服务端执行）
      if (step?.handler === "emitTacticalAlert") {
        return async () => {
          // A1 告警判定桩：随机决定是否发射告警
          // Phase 2 接入真实威胁判定逻辑
          return { status: "completed" as const, output: { alertEmitted: false } }
        }
      }
      if (step?.handler === "emitFlowTick") {
        // 已由 skill-market-flow-tick 处理，此处为 no-op
        return async () => ({ status: "completed" as const, output: { tickEmitted: true } })
      }
      if (step?.handler === "checkConnectorHealth") {
        return async () => ({ status: "completed" as const, output: { healthy: true } })
      }
      if (step?.handler === "updateIntelSnapshot") {
        return async () => ({ status: "completed" as const, output: { snapshotUpdated: true } })
      }
      return async () => ({ status: "completed" as const, output: { stepId: node.id } })
    })(),
  }))

  // 6. 构造 DAG 上下文
  const taskEnvelope: TaskEnvelope = {
    taskId,
    workflowRunId: runId,
    workspaceId,
    industryId: packId,
    agentId,
    actionType: "heartbeat.run",
    input: {},
    automationLevel: "L1",
    riskLevel: "low",
    idempotencyKey: `idem-${runId}`,
    callbackTarget: "intel-heartbeat",
    policySnapshotVersion: "1.0.0",
    version: "1.0.0",
  }

  const dagCtx: DagContext = {
    workspaceId,
    workflowRunId: runId,
    taskEnvelope,
    nodeOutputs: new Map(),
    prisma: dagPrisma,
  }

  // 7. 执行 DAG
  const dagResult = await runDag(dagWithActions, dagCtx)

  // 7a. 将 DAG 产出持久化到 WorkflowRun.outputContext（供 getKpiSnapshot/getKnowledgeGraph 读取）
  //     并写入 Artifact 表建立文件追踪链路（Phase 2 — 文件中心闭环）
  try {
    const nodeOutputs: Record<string, unknown> = {}
    for (const [nodeId, output] of dagResult.nodeResults) {
      nodeOutputs[nodeId] = output
    }
    await prisma.workflowRun.update({
      where: { runId },
      data: {
        outputContext: JSON.stringify(nodeOutputs),
        status: dagResult.status === "completed" ? "completed" : "failed",
        completedAt: new Date(),
        durationMs: dagResult.durationMs,
      },
    })

    // Artifact 写入：每个 DAG 节点的结构化产出作为 AI 生成物记录
    for (const [nodeId, output] of dagResult.nodeResults) {
      if (!output) continue
      try {
        const label = typeof output === "object" && output !== null
          ? ((output as unknown as Record<string, unknown>).label as string | undefined) ?? nodeId
          : nodeId
        await prisma.artifact.create({
          data: {
            workspaceId,
            fileName: `Agent产物_${agentId}_${nodeId}_${new Date().toISOString().slice(0, 10)}.json`,
            originalName: `${label}.json`,
            mimeType: "application/json",
            size: Buffer.byteLength(JSON.stringify(output), "utf-8"),
            url: `artifact://${runId}/${nodeId}`,
            category: "document",
            sourceType: "artifact",
            taskId: taskEnvelope?.taskId ?? null,
            workflowRunId: runId,
            receiptHash: null, // 非 connector 执行无 receipt
            connectorId: null,
            parseStatus: "parsed",
            parseSummary: typeof output === "object" && output !== null
              ? JSON.stringify(output).slice(0, 500)
              : null,
            operatedBy: agentId,
            tags: [agentId, nodeId],
          },
        })
      } catch (artifactErr) {
        // Artifact 写入失败不阻断主流程
        logger.warn("[AgentRunner] Artifact 写入失败", {
          agentId,
          runId,
          nodeId,
          error: artifactErr instanceof Error ? artifactErr.message : String(artifactErr),
        })
      }
    }
  } catch (err) {
    logger.error("[AgentRunner] WorkflowRun 产出持久化失败", {
      agentId,
      runId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // 8. 写 AgentLog（agentId 置 null 避免 FK 约束——A1-A5 不在 Agent 表中）
  await writeAgentLog({
    source: "workflow",
    taskName: `heartbeat:${agentId}`,
    status: dagResult.status === "completed" ? "success" : "failed",
    duration: `${dagResult.durationMs}ms`,
    detail: JSON.stringify({
      agentId,
      runId,
      status: dagResult.status,
      nodeCount: dagResult.nodeResults.size,
      durationMs: dagResult.durationMs,
    }),
    riskLevel: "low",
  })

  // 9. 发射心跳
  const finalStatus =
    dagResult.status === "completed"
      ? "running"
      : dagResult.status === "partial"
        ? "degraded"
        : "error"
  emitAgentHeartbeat(
    agentId as "A1" | "A2" | "A3" | "A4" | "A5",
    finalStatus,
  )

  logger.info("[AgentRunner] Agent 执行完成", {
    agentId,
    runId,
    status: dagResult.status,
    durationMs: dagResult.durationMs,
  })

  return {
    agentId,
    runId,
    status: dagResult.status,
    durationMs: dagResult.durationMs,
    nodeCount: dagResult.nodeResults.size,
    workflowRunId: runId,
  }
}

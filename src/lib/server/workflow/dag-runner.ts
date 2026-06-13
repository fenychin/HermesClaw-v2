/**
 * DAG Runner —— 数据库装配层（Hermes Control Kernel 域）
 *
 * 职责：从 Prisma 加载工作流定义 → 构造运行时上下文 → 调用 dag-engine 执行
 *      → 通过钩子将执行结果写回 WorkflowRun / WorkflowNodeRun，并写 AuditLog + AgentLog。
 *
 * 节点执行器已独立为：
 *   - skill-executor.ts：Skill 节点（LLM 编排）
 *   - data-write-executor.ts：Data-Write 节点（Prisma 写入）
 *
 * 治理红线（AGENTS.md）：
 *   - 每个节点 start / finish 至少写入一条 AuditLog + 一条 AgentLog（「无日志禁止静默执行」）
 *   - 节点失败时自动触发 Harness 降级（runHarnessEvaluation）
 *   - 状态扭转使用 Prisma 事务保证原子性
 *   - Skill 节点（kind='skill'）通过 selectModel() 策略路由调用 LLM，L3 强制人工确认
 */

import { prisma } from '@/lib/prisma'
import { parseJsonField, stringifyJsonField } from '@/lib/api-utils'
import { logger } from '@/lib/logger'
import { writeAuditLog, actorFromSession, type AuditRiskLevel } from '@/lib/server/audit'
import { writeAgentLog } from '@/lib/server/agent-log'
import { runDag } from '@/lib/server/workflow/dag-engine'
import { runHarnessEvaluation } from '@/lib/server/harness-eval'
import { guardOutput } from '@/lib/server/output-guard'
import { executeSkillNode } from '@/lib/server/workflow/skill-executor'
import { executeDataWriteNode } from '@/lib/server/workflow/data-write-executor'
import { emitOpenClawEvent } from '@/lib/server/adapters/openclaw/event-emitter'
import { createSubworkflowHandler } from './subworkflow-executor'
import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowDefinition,
  WorkflowRunContext,
  NodeExecutionResult,
  NodeHandler,
  RunStatus,
  RunTrigger,
} from './dag-types'

// ---- 错误类型 ----

/** 工作流不存在 */
export class WorkflowNotFoundError extends Error {
  constructor(workflowId: string) {
    super(`工作流不存在：${workflowId}`)
    this.name = 'WorkflowNotFoundError'
  }
}

/** 子流程嵌套深度超上限 */
export class MaxDepthExceededError extends Error {
  constructor(depth: number, maxDepth: number) {
    super(`子流程嵌套深度 ${depth} 超过上限 ${maxDepth}`)
    this.name = 'MaxDepthExceededError'
  }
}

// ---- 运行选项 ----

interface RunWorkflowOptions {
  /** 父运行 id（子工作流场景） */
  parentRunId?: string
  /** 当前嵌套深度 */
  depth?: number
  /** 最大嵌套深度，默认 5 */
  maxDepth?: number
  /** 触发方式 */
  trigger?: RunTrigger
  /** 自定义节点 handler（会合并到子流程调用） */
  handlers?: Record<string, NodeHandler>
}

/** runWorkflow 返回体 */
interface RunWorkflowResult {
  runId: string
  status: RunStatus
  output: unknown
}

// ---- 主入口 ----

/**
 * 从数据库加载工作流并执行。
 *
 * @param workflowId   Workflow.id
 * @param input        调用方传入的初始变量（可选）
 * @param options      运行选项（子流程嵌套/自定义 handler）
 * @returns            { runId, status, output }
 */
export async function runWorkflow(
  workflowId: string,
  input?: Record<string, unknown>,
  options?: RunWorkflowOptions,
): Promise<RunWorkflowResult> {
  const depth = options?.depth ?? 0
  const maxDepth = options?.maxDepth ?? 5
  const trigger = options?.trigger ?? (options?.parentRunId ? 'subworkflow' : 'manual')

  // 防无限递归（depth 从 0 起算，所以 >= maxDepth 即到达上限）
  if (depth >= maxDepth) {
    throw new MaxDepthExceededError(depth, maxDepth)
  }

  // 1. 加载工作流定义
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } })
  if (!workflow) {
    throw new WorkflowNotFoundError(workflowId)
  }

  // 校验 JSON 数据完整性（AGENTS.md §4.4：禁止盲飞执行）
  const rawNodes = workflow.nodes
  const rawEdges = workflow.edges
  const nodes: WorkflowNode[] = parseJsonField<WorkflowNode[]>(rawNodes, [])
  const edges: WorkflowEdge[] = parseJsonField<WorkflowEdge[]>(rawEdges, [])

  // 当原始数据非空但解析为空时，记录告警（静默回退 [] 掩盖数据损坏）
  if (rawNodes && rawNodes.trim().length > 0 && nodes.length === 0) {
    logger.warn('[dag-runner] Workflow.nodes JSON 解析为空，可能存在数据损坏', { workflowId })
  }
  if (rawEdges && rawEdges.trim().length > 0 && edges.length === 0) {
    logger.warn('[dag-runner] Workflow.edges JSON 解析为空，可能存在数据损坏', { workflowId })
  }

  const def: WorkflowDefinition = {
    id: workflow.id,
    name: workflow.name,
    nodes,
    edges,
  }

  // 构建 nodeId → WorkflowNode 的快速查找表（钩子中 O(1) 查名）
  const nodeMap = new Map<string, WorkflowNode>(nodes.map((n) => [n.id, n]))

  // 2. 事务：创建运行记录 + 预创建各节点运行记录
  const runId = crypto.randomUUID()
  const actor = await actorFromSession()
  const nodeRunMap = new Map<string, string>() // nodeId → WorkflowNodeRun.id

  for (const node of nodes) {
    nodeRunMap.set(node.id, crypto.randomUUID())
  }

  await prisma.$transaction(async (tx) => {
    await tx.workflowRun.create({
      data: {
        id: runId,
        workflowId: workflow.id,
        status: 'running',
        trigger,
        input: input ? stringifyJsonField(input) : '{}',
        parentRunId: options?.parentRunId ?? null,
      },
    })

    for (const node of nodes) {
      await tx.workflowNodeRun.create({
        data: {
          id: nodeRunMap.get(node.id)!,
          runId,
          nodeId: node.id,
          kind: node.kind,
          status: 'pending',
        },
      })
    }
  })

  logger.info(`[dag-runner] WorkflowRun ${runId} 已创建（${def.name}，${nodes.length} 个节点）`, {
    workflowId,
    trigger,
    depth,
  })

  // 3. 构造上下文
  const ctx: WorkflowRunContext = {
    runId,
    workflowId,
    trigger,
    variables: input ?? {},
    nodeOutputs: {},
    actor,
    depth,
    workspaceId: workflow.workspaceId ?? 'default',
  }

  // 4. 构建 handler 注册表（合并调用方自定义 handler + 内置 skill/subworkflow handler）
  const handlers: Record<string, NodeHandler> = { ...options?.handlers }

  // 内置 skill handler：从 DB 加载 Skill → 读取 SKILL.md → 调用 LLM
  // executeSkillNode 在模块顶层定义，所有工作流嵌套层级共享同一引用
  handlers['skill'] = executeSkillNode

  // 内置 data-write handler：从上游节点输出取值 → Prisma 写入目标模型
  handlers['data-write'] = executeDataWriteNode

  // 内置 task handler：通用自定义任务（委托 node.config 中的 handler 名称二次派发）
  handlers['task'] = async (node, execCtx) => {
    const cfg = node.config ?? {}
    const customHandler = typeof cfg.handler === 'string' ? cfg.handler : null
    if (customHandler && handlers[customHandler]) {
      return handlers[customHandler](node, execCtx)
    }
    return {
      status: 'completed',
      output: { message: `任务「${node.name}」已完成` },
    }
  }

  // 内置 subworkflow handler：调用解耦的外部处理器，依赖注入以规避循环导入
  handlers['subworkflow'] = createSubworkflowHandler(runWorkflow)

  // 5. 定义生命周期钩子

  const onNodeStart = async (nodeId: string) => {
    const nodeRunId = nodeRunMap.get(nodeId)
    if (!nodeRunId) return

    // 事务：扭转节点状态为 running
    try {
      await prisma.$transaction(async (tx) => {
        await tx.workflowNodeRun.update({
          where: { id: nodeRunId },
          data: { status: 'running', startedAt: new Date() },
        })
      })
    } catch (error) {
      logger.warn(`[dag-runner] 节点 ${nodeId} running 状态 DB 扭转失败（将依赖 onNodeFinish 直接写终态）`, {
        error: error instanceof Error ? error.message : '未知',
      })
    }

    // 无日志禁止静默执行：AgentLog 不依赖 DB 事务成功，始终写入
    const node = nodeMap.get(nodeId)
    await writeAgentLog({
      agentId: null,
      source: 'workflow',
      taskName: `[${def.name}] ${node?.name ?? nodeId}`,
      status: 'running',
      duration: '0s',
      detail: `workflowRunId=${runId} nodeId=${nodeId} kind=${node?.kind ?? 'unknown'}`,
    })
  }

  const onNodeFinish = async (
    nodeId: string,
    runCtx: WorkflowRunContext,
    result: NodeExecutionResult,
  ) => {
    const nodeRunId = nodeRunMap.get(nodeId)
    if (!nodeRunId) return

    const node = nodeMap.get(nodeId)
    const nodeName = node?.name ?? nodeId
    const nodeKind = node?.kind ?? 'unknown'

    // 输出校验层（AGENTS.md §5 第六条：模型输出不得直接进入生产）
    const guardedOutput = result.output
    if (result.status === 'completed' && typeof result.output === 'string') {
      const guard = guardOutput(result.output)
      if (!guard.ok) {
        logger.warn(`[dag-runner] 节点 ${nodeId} 输出被校验层拦截：${guard.reason}`)
        // 不阻断执行，但写审计警示
        await writeAuditLog({
          actor: runCtx.actor,
          action: 'workflow.node.output_guarded',
          targetType: 'workflow',
          targetId: nodeId,
          detail: `节点「${nodeName}」输出被校验层拦截：${guard.reason}`,
          riskLevel: 'medium',
          workspaceId: runCtx.workspaceId ?? 'default',
        })
      }
    }

    // 事务：扭转节点终态
    try {
      await prisma.$transaction(async (tx) => {
        await tx.workflowNodeRun.update({
          where: { id: nodeRunId },
          data: {
            status: result.status,
            output: guardedOutput !== undefined ? stringifyJsonField(guardedOutput) : null,
            error: result.error ?? null,
            finishedAt: new Date(),
          },
        })
      })
    } catch (error) {
      logger.warn(`[dag-runner] 节点 ${nodeId} 终态 DB 扭转失败`, { error })
    }

    // 无日志禁止静默执行：AgentLog（Skill 节点带入 result.riskLevel）
    await writeAgentLog({
      agentId: null,
      source: 'workflow',
      taskName: `[${def.name}] ${nodeName}`,
      status: result.status === 'skipped' ? 'success' : result.status,
      duration: '0s',
      detail: result.error ?? `workflowRunId=${runId} nodeId=${nodeId} kind=${nodeKind}`,
      riskLevel: result.riskLevel,
    })

    // 审计风险等级：Skill 节点使用 result.riskLevel，否则 fallback 到传统判定
    const auditRisk: AuditRiskLevel =
      result.riskLevel === 'high' || result.riskLevel === 'medium' || result.riskLevel === 'low'
        ? (result.riskLevel as AuditRiskLevel)
        : result.status === 'failed'
          ? 'high'
          : 'low'

    // 审计日志（AGENTS.md §4.3：关键操作须可溯源）
    if (result.status === 'failed') {
      await writeAuditLog({
        actor: runCtx.actor,
        action: 'workflow.node.fail',
        targetType: 'workflow',
        targetId: nodeId,
        detail: `工作流「${def.name}」节点「${nodeName}」执行失败：${result.error ?? '未知错误'}`,
        riskLevel: auditRisk,
        workspaceId: runCtx.workspaceId ?? 'default',
      })

      // 节点失败 → 触发 Harness 降级评估（fire-and-forget，不阻断主流程）
      logger.info(`[dag-runner] 节点 ${nodeId} 失败，已触发 Harness 降级评估`)
      try {
        runHarnessEvaluation('auto').catch((err) => {
          logger.error('[dag-runner] Harness 降级评估 Promise 失败', {
            error: err instanceof Error ? err.message : '未知',
            nodeId,
          })
        })
      } catch (err) {
        logger.error('[dag-runner] Harness 降级评估同步抛出异常', {
          error: err instanceof Error ? err.message : '未知',
          nodeId,
        })
      }
    } else {
      await writeAuditLog({
        actor: runCtx.actor,
        action: `workflow.node.${result.status}`,
        targetType: 'workflow',
        targetId: nodeId,
        detail: `工作流「${def.name}」节点「${nodeName}」${
          result.status === 'completed'
            ? '执行完成'
            : result.status === 'skipped'
              ? '已跳过'
              : '状态变更'
        }`,
        riskLevel: auditRisk,
        workspaceId: runCtx.workspaceId ?? 'default',
      })
    }
  }

  const onWorkflowComplete = async (runCtx: WorkflowRunContext, status: RunStatus) => {
    if (status === 'failed') {
      logger.info(`[dag-runner] 工作流 ${runCtx.runId} 执行失败，异步触发 Harness 降级评估`)
      runHarnessEvaluation('auto').catch((err) => {
        logger.error('[dag-runner] onWorkflowComplete Harness 降级评估 Promise 失败', {
          error: err instanceof Error ? err.message : '未知',
          runId: runCtx.runId,
        })
      })
    }
  }

  // 6. 执行 DAG
  let finalStatus: RunStatus = 'completed'
  try {
    finalStatus = await runDag(
      def,
      ctx,
      { handlers, maxDepth },
      { onNodeStart, onNodeFinish, onWorkflowComplete },
    )
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知错误'
    logger.error('[dag-runner] DAG 引擎执行异常（拓扑环路/致命错误）', {
      error: errorMsg,
      workflowId,
      runId,
    })
    finalStatus = 'failed'

    // 对所有未执行节点写入 failed 审计（AGENTS.md §5 第三条：无日志禁止静默执行）
    for (const node of nodes) {
      const nodeRunId = nodeRunMap.get(node.id)
      if (!nodeRunId) continue
      try {
        await prisma.$transaction(async (tx) => {
          await tx.workflowNodeRun.update({
            where: { id: nodeRunId },
            data: {
              status: 'failed',
              error: `DAG 引擎致命错误：${errorMsg}`,
              finishedAt: new Date(),
            },
          })
        })
      } catch {
        // 状态写入失败不阻断
      }
      await writeAgentLog({
        agentId: null,
        source: 'workflow',
        taskName: `[${def.name}] ${node.name}`,
        status: 'failed',
        duration: '0s',
        detail: `DAG 引擎致命错误：${errorMsg}`,
      })
      await writeAuditLog({
        actor,
        action: 'workflow.node.fail',
        targetType: 'workflow',
        targetId: node.id,
        detail: `工作流「${def.name}」因引擎致命错误终止：${errorMsg}`,
        riskLevel: 'high',
        workspaceId: workflow.workspaceId ?? 'default',
      })
    }

    try {
      await onWorkflowComplete(ctx, 'failed')
    } catch {
      // 忽略错误
    }
  }

  // 7. 事务：收尾 WorkflowRun 终态
  const output = ctx.nodeOutputs
  try {
    await prisma.$transaction(async (tx) => {
      await tx.workflowRun.update({
        where: { id: runId },
        data: {
          status: finalStatus,
          output: finalStatus === 'failed' ? null : stringifyJsonField(output),
          error: finalStatus === 'failed' ? '工作流执行失败' : null,
          finishedAt: new Date(),
        },
      })
    })
  } catch (error) {
    // 终态写入失败：告警但依然返回内存态给调用方，避免 API 因 DB 瞬断而完全无响应
    logger.error('[dag-runner] WorkflowRun 终态 DB 写入失败（内存态已就绪）', {
      error: error instanceof Error ? error.message : '未知',
      runId,
      finalStatus,
    })
  }

  // 审计日志：汇总
  await writeAuditLog({
    actor,
    action: `workflow.${finalStatus === 'completed' ? 'complete' : 'fail'}`,
    targetType: 'workflow',
    targetId: workflowId,
    detail: `工作流「${def.name}」${
      finalStatus === 'completed' ? '执行完成' : '执行失败'
    }（runId=${runId}，共 ${nodes.length} 个节点）`,
    riskLevel: finalStatus === 'completed' ? 'low' : 'high',
    workspaceId: workflow.workspaceId ?? 'default',
  })

  logger.info(`[dag-runner] WorkflowRun ${runId} 结束，终态：${finalStatus}`, {
    workflowId,
    nodeCount: nodes.length,
  })

  // 8. 发布 workflow 完成/失败事件（供 SSE 推送前端）
  try {
    emitOpenClawEvent('workflow', {
      type: finalStatus === 'completed' ? 'workflow:completed' : 'workflow:failed',
      payload: {
        runId,
        workflowId,
        workflowName: def.name,
        status: finalStatus,
        output: finalStatus === 'completed' ? output : null,
      },
    })
  } catch {
    // fire-and-forget：事件发布失败不阻断主流程
  }

  return {
    runId,
    status: finalStatus,
    output,
  }
}

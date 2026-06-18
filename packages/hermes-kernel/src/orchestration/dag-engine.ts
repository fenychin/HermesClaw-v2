/**
 * DAG Workflow 引擎 —— Hermes Control Kernel 内的纯 TS 实现。
 *
 * 与 apps/web/src/lib/server/workflow/runtime-engine.ts 的关系：
 *   runtime-engine 是 v3.x 历史阶段在 Next.js 内、依赖 Prisma 与 StepRun 表的执行壳；
 *   本模块是符合 CLAUDE.md §3.3 演进路线、可在未来 services/hermes-core 抽离时直接搬走的
 *   纯算法/纯领域版本。它不依赖 apps/web 任何模块，仅通过 @hermesclaw/event-contracts
 *   定义的 TaskEnvelope 等契约对象与外部交互。
 *
 * 实现要点（依据需求 E-1）：
 *   - Kahn 算法做拓扑校验，发现循环立即抛错；
 *   - 同一可运行波次（in-degree 已归零的节点）使用 Promise.all 并行执行；
 *   - 单节点失败不中断整个 DAG，下游依赖节点被标记为 skipped；
 *   - 节点 start / 完成 / 失败 / 跳过 通过 prisma.workflowRun.update + stepLogs.push 留痕；
 *   - DAG 结束时把 WorkflowRun.status 落为 completed 或 failed。
 */

import type { TaskEnvelope } from '@hermesclaw/event-contracts'

/**
 * WorkflowStep —— DAG 编排器消费的最小步骤形状。
 *
 * 与 @hermesclaw/event-contracts 的 WorkflowTemplate.nodes 字段一致：那里是
 * z.unknown()，由各 Industry Pack / Hermes 自身定义具体形态；本引擎仅依赖以下
 * 通用字段即可完成 DAG 拓扑：id（必备）+ dependencies（默认空数组）。
 */
export interface WorkflowStep {
  /** 节点唯一 ID。 */
  id: string
  /** 节点类型（如 agent-call / skill-call / condition），可选。 */
  type?: string
  /** 上游依赖节点 ID 列表。 */
  dependencies?: string[]
  /** 节点配置（透传给具体执行器）。 */
  config?: Record<string, unknown>
}

/**
 * DagPrismaClient —— DAG 引擎对 Prisma 的最小依赖切片。
 *
 * 显式声明而不是 `any`，让单测可以直接 mock 一个 vi.fn() 进来；同时避免把
 * apps/web 的 Prisma 类型反向引入 hermes-kernel（违反 CLAUDE.md §3.2 边界）。
 */
export interface DagPrismaClient {
  workflowRun: {
    update: (args: {
      where: { runId: string }
      data: Record<string, unknown>
    }) => Promise<unknown>
  }
}

export interface DagContext {
  workspaceId: string
  workflowRunId: string
  taskEnvelope: TaskEnvelope
  /** 节点产出的输出结果集合，供下游节点通过 deps 读取。 */
  nodeOutputs: Map<string, unknown>
  prisma: DagPrismaClient
}

export interface DagNodeResult {
  status: 'completed' | 'failed' | 'skipped'
  output?: unknown
  error?: string
}

export type DagAction = (ctx: DagContext) => Promise<DagNodeResult>

export interface DagNode {
  id: string
  deps: string[]
  action: DagAction
}

export interface DagRunResult {
  runId: string
  /**
   * - completed：所有节点 completed；
   * - failed：没有任何节点 completed；
   * - partial：存在 completed 与 failed/skipped 混合（用于上层观测，DB 仍记为 failed）。
   */
  status: 'completed' | 'failed' | 'partial'
  nodeResults: Map<string, DagNodeResult>
  durationMs: number
}

/** stepLogs JSON 数组中的单条日志结构。 */
interface StepLogEntry {
  nodeId: string
  phase: 'start' | 'completed' | 'failed' | 'skipped'
  timestamp: string
  status?: DagNodeResult['status']
  error?: string
}

async function appendStepLog(
  prisma: DagPrismaClient,
  runId: string,
  entry: StepLogEntry,
): Promise<void> {
  // stepLogs 是 Json 数组：用 Prisma 的 push 语义追加单条日志。
  // 留痕失败不应中断 DAG —— 上层调用方负责持久化保证。
  try {
    await prisma.workflowRun.update({
      where: { runId },
      data: { stepLogs: { push: entry } },
    })
  } catch {
    // 静默吞掉，避免单条审计写失败拖垮整轮 DAG。
  }
}

/**
 * 运行一个 DAG。
 *
 * 算法：Kahn 拓扑排序 + 波次并行（每一轮把当前 in-degree=0 的节点全部 Promise.all）。
 *
 * 失败传播规则：节点 status !== 'completed' 时，所有以其为依赖的下游节点直接置为
 * 'skipped'（不调用 action）。这与 runtime-engine 的 propagateSkip 行为对齐。
 */
export async function runDag(
  nodes: DagNode[],
  ctx: DagContext,
): Promise<DagRunResult> {
  const startTime = Date.now()

  // —— 1. 构图 ——
  const nodeMap = new Map<string, DagNode>()
  const indegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()

  for (const node of nodes) {
    if (nodeMap.has(node.id)) {
      throw new Error(`Duplicate DAG node id: ${node.id}`)
    }
    nodeMap.set(node.id, node)
    indegree.set(node.id, node.deps.length)
    dependents.set(node.id, [])
  }
  for (const node of nodes) {
    for (const dep of node.deps) {
      if (!nodeMap.has(dep)) {
        throw new Error(`DAG node "${node.id}" depends on missing node "${dep}"`)
      }
      const list = dependents.get(dep)
      if (list) list.push(node.id)
    }
  }

  // —— 2. 循环依赖预校验（模拟一次完整 Kahn 流程，看能否覆盖全部节点）——
  const simIndeg = new Map(indegree)
  const simQueue: string[] = []
  for (const [id, deg] of simIndeg.entries()) {
    if (deg === 0) simQueue.push(id)
  }
  let processed = 0
  while (simQueue.length > 0) {
    const id = simQueue.shift() as string
    processed++
    const children = dependents.get(id)
    if (!children) continue
    for (const child of children) {
      const next = (simIndeg.get(child) ?? 0) - 1
      simIndeg.set(child, next)
      if (next === 0) simQueue.push(child)
    }
  }
  if (processed !== nodes.length) {
    throw new Error(
      `DAG contains a cycle: cannot perform topological sort (covered ${processed}/${nodes.length} nodes)`,
    )
  }

  // —— 3. 波次并行执行 ——
  const nodeResults = new Map<string, DagNodeResult>()
  const remaining = new Map(indegree)
  let ready: string[] = []
  for (const [id, deg] of remaining.entries()) {
    if (deg === 0) ready.push(id)
  }

  while (ready.length > 0) {
    const wave = ready
    ready = []

    const waveOutcomes = await Promise.all(
      wave.map(async (id): Promise<{ id: string; result: DagNodeResult }> => {
        const node = nodeMap.get(id)
        if (!node) {
          // 理论不可达：所有 ready 都来自 nodeMap 的 key。
          const result: DagNodeResult = { status: 'failed', error: `node "${id}" missing in map` }
          nodeResults.set(id, result)
          return { id, result }
        }

        // 上游有 failed / skipped → 自身置 skipped，不调用 action。
        const upstreamBlocked = node.deps.some((d) => {
          const r = nodeResults.get(d)
          return !!r && r.status !== 'completed'
        })
        if (upstreamBlocked) {
          const result: DagNodeResult = { status: 'skipped' }
          nodeResults.set(id, result)
          await appendStepLog(ctx.prisma, ctx.workflowRunId, {
            nodeId: id,
            phase: 'skipped',
            timestamp: new Date().toISOString(),
            status: 'skipped',
          })
          return { id, result }
        }

        await appendStepLog(ctx.prisma, ctx.workflowRunId, {
          nodeId: id,
          phase: 'start',
          timestamp: new Date().toISOString(),
        })

        let result: DagNodeResult
        try {
          result = await node.action(ctx)
        } catch (err) {
          result = {
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
          }
        }

        nodeResults.set(id, result)
        if (result.status === 'completed' && result.output !== undefined) {
          ctx.nodeOutputs.set(id, result.output)
        }

        await appendStepLog(ctx.prisma, ctx.workflowRunId, {
          nodeId: id,
          phase: result.status === 'completed' ? 'completed' : 'failed',
          timestamp: new Date().toISOString(),
          status: result.status,
          error: result.error,
        })

        return { id, result }
      }),
    )

    // 波次完成后，把每个节点的下游 in-degree 减 1，归零的进入下一波。
    for (const { id } of waveOutcomes) {
      const children = dependents.get(id)
      if (!children) continue
      for (const child of children) {
        const next = (remaining.get(child) ?? 0) - 1
        remaining.set(child, next)
        if (next === 0) ready.push(child)
      }
    }
  }

  // —— 4. 汇总 & 落库 ——
  const statuses = Array.from(nodeResults.values()).map((r) => r.status)
  let overall: DagRunResult['status']
  if (statuses.length > 0 && statuses.every((s) => s === 'completed')) {
    overall = 'completed'
  } else if (statuses.some((s) => s === 'completed')) {
    overall = 'partial'
  } else {
    overall = 'failed'
  }

  const durationMs = Date.now() - startTime

  // WorkflowRun.status 只有 completed / failed 两种终态（CLAUDE.md §8.1 留痕约束）；
  // partial 在 DB 层归并为 failed，但 DagRunResult.status 仍保留更细粒度供调用方观测。
  try {
    await ctx.prisma.workflowRun.update({
      where: { runId: ctx.workflowRunId },
      data: {
        status: overall === 'completed' ? 'completed' : 'failed',
        completedAt: new Date(),
        durationMs,
      },
    })
  } catch {
    // 同上：不让落库失败影响调用方感知到的 DAG 结果。
  }

  return {
    runId: ctx.workflowRunId,
    status: overall,
    nodeResults,
    durationMs,
  }
}

/**
 * 把 WorkflowTemplate 的 step 列表映射成 DagNode 列表。
 *
 * 注意：这里只做拓扑结构映射，action 是一个占位的 no-op completed action。
 * 真实的执行器（agent-call / skill-call / connector-call …）应由调用方按 step.type
 * 注入对应的 DagAction，例如：
 *
 *   const dag = buildDagFromWorkflowTemplate(steps).map(node => ({
 *     ...node,
 *     action: resolveActionByType(stepMap.get(node.id))
 *   }))
 *
 * 这样保持 dag-engine 不依赖任何具体能力实现，符合 CLAUDE.md §2.2 Contract-First。
 */
export function buildDagFromWorkflowTemplate(template: WorkflowStep[]): DagNode[] {
  return template.map((step) => ({
    id: step.id,
    deps: step.dependencies ?? [],
    action: async (): Promise<DagNodeResult> => ({
      status: 'completed',
      output: { stepId: step.id, type: step.type },
    }),
  }))
}

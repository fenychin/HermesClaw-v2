/**
 * DAG 核心执行器 —— 轻量级拓扑分层 + 并行节点调度
 *
 * 职责：纯编排（拓扑排序、分层并行、条件分支路由、handler 分派）。
 * —— 不直接依赖 Prisma，不直接写日志，状态扭转与审计由 dag-runner 通过
 *    DagEngineHooks 回调注入。
 *
 * 约束（AGENTS.md）：
 *   - 无 handler 可执行 ≠ 静默跳过 → 返回 failed 节点，由 runner 记录审计并触发降级
 *   - 禁止 eval 任意表达式：condition 节点仅做 === 字符串比对，不执行用户代码
 */

import type {
  WorkflowDefinition,
  WorkflowRunContext,
  DagEngineOptions,
  DagEngineHooks,
  WorkflowNode,
  WorkflowEdge,
  NodeHandler,
  NodeExecutionResult,
  RunStatus,
} from './dag-types'

// ---- 内部常量 ----

/** 跳过标记前缀，存入 ctx.nodeOutputs 以避免与正常输出键冲突 */
const SKIPPED_PREFIX = '__skipped__'

/** 安全调用生命周期钩子：异常日志警告但吞食，不阻断引擎主流程 */
async function safeHook(fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (error) {
    // 钩子异常记录警告，不阻断引擎执行
    console.warn('[dag-engine] 引擎生命周期钩子执行失败：', error)
  }
}

/** 在上下文中标记节点已被跳过 */
function markNodeSkipped(ctx: WorkflowRunContext, nodeId: string): void {
  ctx.nodeOutputs[`${SKIPPED_PREFIX}${nodeId}`] = true
}

/**
 * 递归传播跳过状态。
 * 将指定的节点及其所有后继节点从 activeNodes 中移除，并在 ctx 中标记为 skipped，
 * 同时对尚未被跳过/执行的节点触发 onNodeFinish 钩子。
 */
async function propagateSkip(
  startNodeIds: string[],
  activeNodes: Set<string>,
  ctx: WorkflowRunContext,
  edgeTable: Map<string, Map<string | undefined, string[]>>,
  hooks: DagEngineHooks,
  reason: string,
): Promise<void> {
  const visited = new Set<string>()
  const queue = [...startNodeIds]

  while (queue.length > 0) {
    const curr = queue.shift()!
    if (visited.has(curr)) continue
    visited.add(curr)

    if (activeNodes.has(curr)) {
      activeNodes.delete(curr)
      markNodeSkipped(ctx, curr)
      await safeHook(() =>
        hooks.onNodeFinish?.(curr, ctx, {
          status: 'skipped',
          output: null,
          error: reason,
        }) ?? Promise.resolve(),
      )
    }

    const inner = edgeTable.get(curr)
    if (inner) {
      for (const [, tos] of inner) {
        for (const to of tos) {
          if (!visited.has(to)) {
            queue.push(to)
          }
        }
      }
    }
  }
}

// ---- 内置 handler ----

/** noop handler：直接返回 completed，输出 null */
const noopHandler: NodeHandler = async () => ({
  status: 'completed',
  output: null,
})

/** condition handler：按 config 比对 ctx 中的变量值，返回分支标签 */
const conditionHandler: NodeHandler = async (node, ctx) => {
  const config = node.config ?? {}
  // 安全求值：仅支持 ctx.variables.<key> === <value> 的字面匹配，不做 eval
  const varName = typeof config.variable === 'string' ? config.variable : null
  const expected = config.expected

  if (!varName) {
    return { status: 'failed', error: `条件节点 ${node.id} 缺少 config.variable 配置` }
  }

  // 变量缺失检测：必须在 ctx.variables 中存在且不能为 undefined
  if (!(varName in ctx.variables) || ctx.variables[varName] === undefined) {
    return {
      status: 'failed',
      error: `条件节点 ${node.id} 执行失败：无法在上下文中找到变量 ctx.variables.${varName}`,
    }
  }

  const actual = ctx.variables[varName]
  const actualStr = actual === null ? 'null' : String(actual)
  const expectedStr = expected === undefined || expected === null ? 'null' : String(expected)

  const matched = actualStr === expectedStr
  const branch = matched
    ? (typeof config.trueBranch === 'string' ? config.trueBranch : 'true')
    : (typeof config.falseBranch === 'string' ? config.falseBranch : 'false')

  return {
    status: 'completed',
    output: { matched, varName, actual: actualStr, expected: expectedStr },
    branch,
  }
}

/** 内置 handler 表（可按 key 覆盖） */
const BUILTIN_HANDLERS: Record<string, NodeHandler> = {
  noop: noopHandler,
  condition: conditionHandler,
}

// ---- 拓扑排序与分层 ----

interface InternalNode {
  id: string
  kind: string
}

interface TopoLayer {
  nodeIds: string[]
  level: number
}

/**
 * Kahn 拓扑分层。
 * - 返回分层数组 [layer0, layer1, …]，同层节点可并行。
 * - 若有环则抛出 Error（含未处理节点 id，供上层审计）。
 */
function topoSort(
  nodes: InternalNode[],
  edges: WorkflowEdge[],
): TopoLayer[] {
  const adj = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  for (const n of nodes) {
    adj.set(n.id, [])
    inDegree.set(n.id, 0)
  }

  for (const e of edges) {
    if (!adj.has(e.from) || !adj.has(e.to)) continue // 悬挂边忽略
    const out = adj.get(e.from)
    if (out) out.push(e.to)
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
  }

  const layers: TopoLayer[] = []
  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  let level = 0
  let processed = 0

  while (queue.length > 0) {
    const layerSize = queue.length
    const layerNodeIds: string[] = []
    for (let i = 0; i < layerSize; i++) {
      const nodeId = queue.shift()
      if (!nodeId) continue
      layerNodeIds.push(nodeId)
      processed++
      const outgoing = adj.get(nodeId) ?? []
      for (const neighbor of outgoing) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, newDeg)
        if (newDeg === 0) {
          queue.push(neighbor)
        }
      }
    }
    layers.push({ nodeIds: layerNodeIds, level })
    level++
  }

  if (processed !== nodes.length) {
    const remaining = nodes.filter((n) => (inDegree.get(n.id) ?? 0) > 0)
    throw new Error(
      `DAG 环路检测失败：${remaining.length} 个节点存在循环依赖 ` +
      `(${remaining.map((n) => n.id).join(', ')})`,
    )
  }

  return layers
}

// ---- handler 解析 ----

function resolveHandler(
  node: WorkflowNode,
  options: DagEngineOptions,
): NodeHandler | null {
  // 1. 显式 handler 名优先
  if (node.handler && options.handlers?.[node.handler]) {
    return options.handlers[node.handler]
  }
  // 2. kind 查自定义注册表
  if (options.handlers?.[node.kind]) {
    return options.handlers[node.kind]
  }
  // 3. 内置 handler（noop / condition）
  if (BUILTIN_HANDLERS[node.kind]) {
    return BUILTIN_HANDLERS[node.kind]
  }
  return null
}

// ---- 条件分支解析 ----

/** 构建 from → { when → to[] } 的出边表，用于条件路由 */
function buildEdgeTable(edges: WorkflowEdge[]): Map<string, Map<string | undefined, string[]>> {
  const table = new Map<string, Map<string | undefined, string[]>>()
  for (const e of edges) {
    if (!table.has(e.from)) {
      table.set(e.from, new Map())
    }
    const inner = table.get(e.from)!
    const key = e.when
    if (!inner.has(key)) {
      inner.set(key, [])
    }
    inner.get(key)!.push(e.to)
  }
  return table
}

/** 根据上游节点的 branch 结果筛选应执行的下游节点 id 集合 */
function resolveDownstream(
  edgeTable: Map<string, Map<string | undefined, string[]>>,
  nodeId: string,
  branch: string | undefined,
): string[] {
  const inner = edgeTable.get(nodeId)
  if (!inner) return []

  const result = new Set<string>()
  // 无条件边（when 未设置）：总是激活
  for (const to of inner.get(undefined) ?? []) {
    result.add(to)
  }
  // 条件边：仅当 branch === when 时激活
  if (branch !== undefined) {
    for (const to of inner.get(branch) ?? []) {
      result.add(to)
    }
  }
  return Array.from(result)
}

// ---- 主入口 ----

/**
 * 执行一次 DAG 工作流。
 *
 * @param def     工作流定义（nodes + edges）
 * @param ctx     运行时上下文（variables、actor 等）
 * @param options 引擎选项（handlers 注册表、maxDepth）
 * @param hooks   生命周期钩子（onNodeStart / onNodeFinish）
 * @returns       整体运行终态
 */
export async function runDag(
  def: WorkflowDefinition,
  ctx: WorkflowRunContext,
  options: DagEngineOptions = {},
  hooks: DagEngineHooks = {},
): Promise<RunStatus> {
  // 0. 空图 → 不执行任何逻辑，直接完成
  if (def.nodes.length === 0) {
    return 'completed'
  }

  // 1. 拓扑分层
  const internalNodes: InternalNode[] = def.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
  }))
  const layers = topoSort(internalNodes, def.edges)

  // 2. 构建出边表（条件路由用）
  const edgeTable = buildEdgeTable(def.edges)

  // 3. 构建 nodeId → WorkflowNode 的快速查找
  const nodeMap = new Map<string, WorkflowNode>()
  for (const n of def.nodes) {
    nodeMap.set(n.id, n)
  }

  // 4. 需要执行的节点集合（会被条件分支裁剪/跳过）
  const activeNodes = new Set(def.nodes.map((n) => n.id))

  // 5. 逐层执行
  let anyFailed = false

  for (const layer of layers) {
    // 当前层中仍需执行的节点
    const activeInLayer = layer.nodeIds.filter((id) => activeNodes.has(id))

    if (activeInLayer.length === 0) continue

    // 同层节点并行
    const layerResults = await Promise.all(
      activeInLayer.map(async (nodeId) => {
        const node = nodeMap.get(nodeId)
        if (!node) {
          // 节点不在定义中：必须通知 runner 记录审计（AGENTS.md §5 第三条：无日志禁止静默执行）
          const missingResult: NodeExecutionResult = {
            status: 'failed',
            error: `节点 ${nodeId} 未在工作流定义中找到`,
          }
          await safeHook(() => hooks.onNodeStart?.(nodeId, ctx) ?? Promise.resolve())
          await safeHook(() => hooks.onNodeFinish?.(nodeId, ctx, missingResult) ?? Promise.resolve())
          return { nodeId, result: missingResult }
        }

        // 5a. 查找 handler
        const handler = resolveHandler(node, options)
        if (!handler) {
          const missingResult: NodeExecutionResult = {
            status: 'failed',
            error: `无可用 handler：${node.handler ?? node.kind}（节点 ${nodeId}）`,
          }
          await safeHook(() => hooks.onNodeStart?.(nodeId, ctx) ?? Promise.resolve())
          await safeHook(() => hooks.onNodeFinish?.(nodeId, ctx, missingResult) ?? Promise.resolve())
          return { nodeId, result: missingResult }
        }

        // 5b. onNodeStart 钩子
        await safeHook(() => hooks.onNodeStart?.(nodeId, ctx) ?? Promise.resolve())

        // 5c. 执行 handler
        let result: NodeExecutionResult
        try {
          result = await handler(node, ctx)
        } catch (error) {
          result = {
            status: 'failed',
            error: error instanceof Error ? error.message : '节点执行异常',
          }
        }

        // 5d. 写入 ctx.nodeOutputs
        if (result.output !== undefined) {
          ctx.nodeOutputs[nodeId] = result.output
        }

        // 5e. onNodeFinish 钩子
        await safeHook(() => hooks.onNodeFinish?.(nodeId, ctx, result) ?? Promise.resolve())

        return { nodeId, result }
      }),
    )

    // 6. 处理当前层结果：筛选下游 & 标记失败/跳过节点
    for (const { nodeId, result } of layerResults) {
      if (result.status === 'failed') {
        anyFailed = true
        // 收集失败节点的所有直接下游（包含所有分支，防止故障扩散）
        const allDownstream: string[] = []
        const inner = edgeTable.get(nodeId)
        if (inner) {
          for (const [, tos] of inner) {
            allDownstream.push(...tos)
          }
        }
        // 递归传播 skip 状态到所有可达后继节点
        if (allDownstream.length > 0) {
          await propagateSkip(
            allDownstream,
            activeNodes,
            ctx,
            edgeTable,
            hooks,
            `上游节点 ${nodeId} 失败，跳过执行`,
          )
        }
        continue
      }

      // 6a. 条件分支路由：仅 condition 节点走分支裁剪逻辑
      if (result.branch !== undefined) {
        const branch = result.branch
        const inner = edgeTable.get(nodeId)
        if (inner) {
          const unactivatedDownstream: string[] = []
          for (const [when, tos] of inner) {
            if (when !== undefined && when !== branch) {
              unactivatedDownstream.push(...tos)
            }
          }
          // 对未激活的分支进行递归 skip 传播
          if (unactivatedDownstream.length > 0) {
            await propagateSkip(
              unactivatedDownstream,
              activeNodes,
              ctx,
              edgeTable,
              hooks,
              `条件分支未命中（上游 ${nodeId} → ${branch}），跳过执行`,
            )
          }
        }
      }
    }
  }

  // 7. 检查悬挂节点（定义中存在但未被任何拓扑层覆盖的孤立节点）
  for (const n of def.nodes) {
    if (!activeNodes.has(n.id)) continue
    const covered = layers.some((l) => l.nodeIds.includes(n.id))
    const skipKey = `${SKIPPED_PREFIX}${n.id}`
    if (!covered && !ctx.nodeOutputs[skipKey]) {
      activeNodes.delete(n.id)
      markNodeSkipped(ctx, n.id)
      await safeHook(() =>
        hooks.onNodeFinish?.(n.id, ctx, {
          status: 'skipped',
          output: null,
          error: '节点未在任何拓扑层中，已跳过',
        }) ?? Promise.resolve(),
      )
    }
  }

  const finalStatus = anyFailed ? 'failed' : 'completed'
  // 调用工作流完成钩子，通知 runner 进行全局收尾
  await safeHook(() => hooks.onWorkflowComplete?.(ctx, finalStatus) ?? Promise.resolve())

  return finalStatus
}

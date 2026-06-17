export interface TopoNode {
  id: string
}

export interface TopoEdge {
  from: string
  to: string
}

export interface TopoLayer {
  nodeIds: string[]
  level: number
}

/**
 * Kahn 拓扑分层算法。
 * - 返回分层数组 [layer0, layer1, …]，同层节点可并行。
 * - 若有环则抛出 Error。
 */
export function topoSortLayers(nodes: TopoNode[], edges: TopoEdge[]): TopoLayer[] {
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
      `DAG contains cycles (DAG 环路检测失败): ${remaining.length} nodes have circular dependencies ` +
      `(${remaining.map((n) => n.id).join(', ')})`,
    )
  }

  return layers
}

/**
 * 展平的拓扑排序。
 * - 返回严格按拓扑排序的节点对象数组。
 */
export function topoSortFlat<T extends TopoNode>(nodes: T[], edges: TopoEdge[]): T[] {
  const layers = topoSortLayers(nodes, edges)
  const sortedIds = layers.flatMap(l => l.nodeIds)
  return sortedIds.map(id => nodes.find(n => n.id === id)!)
}

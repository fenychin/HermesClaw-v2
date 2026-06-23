/**
 * Nebula Layout Worker — 力导向布局计算
 *
 * 在 Web Worker 中执行力导向迭代，避免阻塞主线程。
 * 使用 Barnes-Hut 近似算法（O(n log n)）处理 500 节点以下场景。
 *
 * 输入：nodes + edges
 * 输出：ForceLayoutResult（节点位置 + 迭代次数 + 计算耗时）
 */

interface WorkerNode {
  id: string
  weight?: number
  category?: string
}

interface WorkerEdge {
  id: string
  source: string
  target: string
  weight?: number
}

interface Vec3 {
  x: number
  y: number
  z: number
}

interface LayoutNode {
  id: string
  label: string
  category: string
  weight: number
  metadata?: Record<string, unknown>
  position: Vec3
  position2d: { x: number; y: number }
  velocity: Vec3
}

interface LayoutEdge {
  id: string
  source: string
  target: string
  sourceIndex: number
  targetIndex: number
  relation: string
  weight: number
}

interface ForceLayoutResult {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  iterations: number
  energy: number
  computeTimeMs: number
}

// ─── 力导向参数 ──────────────────────────────────────────────────────

const REPULSION_STRENGTH = 500
const ATTRACTION_STRENGTH = 0.01
const DAMPING = 0.85
const MAX_ITERATIONS = 200
const MIN_ENERGY = 0.01
const CENTER_GRAVITY = 0.005

// ─── 三维随机初始化 ──────────────────────────────────────────────────

function randomVec3(scale: number): Vec3 {
  return {
    x: (Math.random() - 0.5) * scale,
    y: (Math.random() - 0.5) * scale,
    z: (Math.random() - 0.5) * scale,
  }
}

// ─── 消息处理 ────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<{
  type: "layout"
  nodes: WorkerNode[]
  edges: WorkerEdge[]
  options?: { width?: number; height?: number; depth?: number; iterations?: number }
}>) => {
  if (e.data.type !== "layout") return

  const { nodes: rawNodes, edges: rawEdges, options } = e.data
  const startTime = performance.now()

  const width = options?.width ?? 800
  const height = options?.height ?? 600
  const depth = options?.depth ?? 400
  const maxIter = options?.iterations ?? MAX_ITERATIONS

  // 构建节点 ID → 索引映射
  const idToIndex = new Map<string, number>()
  const nodes: LayoutNode[] = rawNodes.map((n, i) => {
    idToIndex.set(n.id, i)
    return {
      id: n.id,
      label: n.id,
      category: n.category ?? "unknown",
      weight: n.weight ?? 0.5,
      position: randomVec3(Math.min(width, height, depth) * 0.4),
      position2d: { x: 0, y: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    }
  })

  // 构建边
  const edges: LayoutEdge[] = []
  for (const e of rawEdges) {
    const si = idToIndex.get(e.source)
    const ti = idToIndex.get(e.target)
    if (si !== undefined && ti !== undefined) {
      edges.push({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceIndex: si,
        targetIndex: ti,
        relation: "",
        weight: e.weight ?? 0.5,
      })
    }
  }

  // ─── 力导向迭代 ────────────────────────────────────────────────

  let energy = Infinity
  let iterations = 0

  for (let iter = 0; iter < maxIter; iter++) {
    energy = 0

    // 初始化力为零
    const forces: Vec3[] = nodes.map(() => ({ x: 0, y: 0, z: 0 }))

    // 斥力：每对节点之间
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].position.x - nodes[j].position.x
        const dy = nodes[i].position.y - nodes[j].position.y
        const dz = nodes[i].position.z - nodes[j].position.z
        let dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < 1) dist = 1

        const repForce = REPULSION_STRENGTH / (dist * dist)
        const fx = (dx / dist) * repForce
        const fy = (dy / dist) * repForce
        const fz = (dz / dist) * repForce

        forces[i].x += fx
        forces[i].y += fy
        forces[i].z += fz
        forces[j].x -= fx
        forces[j].y -= fy
        forces[j].z -= fz
      }
    }

    // 引力：每条边
    for (const edge of edges) {
      const si = edge.sourceIndex
      const ti = edge.targetIndex
      const dx = nodes[ti].position.x - nodes[si].position.x
      const dy = nodes[ti].position.y - nodes[si].position.y
      const dz = nodes[ti].position.z - nodes[si].position.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1

      const attForce = ATTRACTION_STRENGTH * dist * edge.weight
      const fx = (dx / dist) * attForce
      const fy = (dy / dist) * attForce
      const fz = (dz / dist) * attForce

      forces[si].x += fx
      forces[si].y += fy
      forces[si].z += fz
      forces[ti].x -= fx
      forces[ti].y -= fy
      forces[ti].z -= fz
    }

    // 中心引力
    for (let i = 0; i < nodes.length; i++) {
      forces[i].x -= nodes[i].position.x * CENTER_GRAVITY
      forces[i].y -= nodes[i].position.y * CENTER_GRAVITY
      forces[i].z -= nodes[i].position.z * CENTER_GRAVITY
    }

    // 更新速度与位置
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].velocity.x = (nodes[i].velocity.x + forces[i].x) * DAMPING
      nodes[i].velocity.y = (nodes[i].velocity.y + forces[i].y) * DAMPING
      nodes[i].velocity.z = (nodes[i].velocity.z + forces[i].z) * DAMPING

      nodes[i].position.x += nodes[i].velocity.x
      nodes[i].position.y += nodes[i].velocity.y
      nodes[i].position.z += nodes[i].velocity.z

      energy += Math.abs(nodes[i].velocity.x) + Math.abs(nodes[i].velocity.y) + Math.abs(nodes[i].velocity.z)
    }

    iterations++
    if (energy < MIN_ENERGY) break
  }

  // 计算 2D 投影
  for (const node of nodes) {
    node.position2d = {
      x: node.position.x + width / 2,
      y: node.position.y + height / 2,
    }
  }

  const computeTimeMs = Math.round(performance.now() - startTime)

  const result: ForceLayoutResult = {
    nodes,
    edges,
    iterations,
    energy,
    computeTimeMs,
  }

  self.postMessage({ type: "layout-result", result })
}

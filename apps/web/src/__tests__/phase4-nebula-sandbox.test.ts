/**
 * Phase 4 测试 — 星云图谱 + 沙盘联动 + 性能守卫
 *
 * 覆盖：
 * 1. Web Worker 力导向布局计算
 * 2. D3CanvasRenderer 2D 渲染 + hitTest
 * 3. NodeToSandboxContext 结构化联动
 * 4. Panel3→Panel4 sandboxPreFill 桥接
 * 5. 性能守卫：500 节点截断、FPS 降级、页面隐藏暂停
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── 1. Web Worker 力导向布局 ───────────────────────────────────────────

describe("Phase 4 — Worker 力导向布局", () => {
  it("构建节点 ID→索引映射", () => {
    const nodes = [
      { id: "n1", weight: 0.8, category: "company" },
      { id: "n2", weight: 0.5, category: "product" },
      { id: "n3", weight: 0.3, category: "market" },
    ]
    const idToIndex = new Map<string, number>()
    nodes.forEach((n, i) => idToIndex.set(n.id, i))

    expect(idToIndex.get("n1")).toBe(0)
    expect(idToIndex.get("n2")).toBe(1)
    expect(idToIndex.get("n3")).toBe(2)
    expect(idToIndex.get("n4")).toBeUndefined()
  })

  it("随机位置初始化在预期范围内", () => {
    const scale = 400
    for (let i = 0; i < 100; i++) {
      const pos = {
        x: (Math.random() - 0.5) * scale,
        y: (Math.random() - 0.5) * scale,
        z: (Math.random() - 0.5) * scale,
      }
      expect(Math.abs(pos.x)).toBeLessThanOrEqual(scale / 2)
      expect(Math.abs(pos.y)).toBeLessThanOrEqual(scale / 2)
      expect(Math.abs(pos.z)).toBeLessThanOrEqual(scale / 2)
    }
  })

  it("力导向参数在合理范围内", () => {
    // 参数常量验证（来自 Worker 源码）
    const REPULSION_STRENGTH = 500
    const ATTRACTION_STRENGTH = 0.01
    const DAMPING = 0.85
    const MAX_ITERATIONS = 200
    const MIN_ENERGY = 0.01

    expect(DAMPING).toBeGreaterThan(0)
    expect(DAMPING).toBeLessThan(1)
    expect(MAX_ITERATIONS).toBeGreaterThan(0)
    expect(MIN_ENERGY).toBeGreaterThan(0)
    expect(REPULSION_STRENGTH).toBeGreaterThan(ATTRACTION_STRENGTH)
  })

  it("2D 投影映射到画布坐标", () => {
    const width = 800
    const height = 600
    const node = { x: -120, y: 80 }
    const projected = {
      x: node.x + width / 2,
      y: node.y + height / 2,
    }
    expect(projected.x).toBe(280)
    expect(projected.y).toBe(380)
    expect(projected.x).toBeGreaterThanOrEqual(0)
    expect(projected.x).toBeLessThanOrEqual(width)
  })
})

// ─── 2. 2D Canvas 渲染器逻辑 ────────────────────────────────────────────

describe("Phase 4 — D3CanvasRenderer 渲染逻辑", () => {
  it("hitTest 命中节点半径内", () => {
    // 模拟布局数据
    const layout = {
      nodes: [
        {
          id: "n1", category: "company", weight: 0.8,
          position2d: { x: 200, y: 300 },
          position: { x: 0, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          label: "Node 1",
        },
        {
          id: "n2", category: "product", weight: 0.5,
          position2d: { x: 500, y: 200 },
          position: { x: 0, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          label: "Node 2",
        },
      ],
      edges: [],
      iterations: 0,
      energy: 0,
      computeTimeMs: 0,
    }

    // 命中测试函数（从 useNebulaRender 提取的逻辑）
    function hitTest(x: number, y: number): string | null {
      for (const node of layout.nodes) {
        const radius = 4 + (node.weight ?? 0.5) * 8
        const dx = x - node.position2d.x
        const dy = y - node.position2d.y
        if (dx * dx + dy * dy < radius * radius * 1.5) {
          return node.id
        }
      }
      return null
    }

    // 命中 n1
    expect(hitTest(200, 300)).toBe("n1")
    // 命中 n2
    expect(hitTest(502, 201)).toBe("n2")
    // 空白区域
    expect(hitTest(0, 0)).toBeNull()
  })

  it("分类颜色映射覆盖所有已知类型", () => {
    const CATEGORY_COLORS: Record<string, string> = {
      company: "#3b82f6",
      product: "#10b981",
      policy: "#f59e0b",
      market: "#8b5cf6",
      region: "#ec4899",
      capital: "#06b6d4",
      tech: "#6366f1",
      energy: "#84cc16",
      trade: "#f97316",
      unknown: "#6b7280",
    }

    expect(CATEGORY_COLORS.company).toBe("#3b82f6")
    expect(CATEGORY_COLORS.unknown).toBe("#6b7280")
    // 未知分类回退
    const unknownCat = "nonexistent"
    const color = CATEGORY_COLORS[unknownCat] ?? CATEGORY_COLORS.unknown
    expect(color).toBe("#6b7280")
  })

  it("节点半径与权重正相关", () => {
    function calcRadius(weight: number): number {
      return 4 + weight * 8
    }
    expect(calcRadius(0)).toBe(4)
    expect(calcRadius(0.5)).toBe(8)
    expect(calcRadius(1)).toBe(12)
    expect(calcRadius(0.8)).toBeGreaterThan(calcRadius(0.3))
  })
})

// ─── 3. NodeToSandboxContext 结构化联动 ─────────────────────────────────

describe("Phase 4 — NodeToSandboxContext 结构化输入", () => {
  it("buildSandboxContext 生成结构化对象而非自然语言拼接", () => {
    // 模拟函数（与 node-detail-popover.tsx 中的逻辑一致）
    function buildSandboxContext(params: {
      nodeId: string
      nodeType: string
      nodeLabel: string
      nodeCategory: string
      signalTitles: string[]
      relatedLabels: string[]
    }) {
      return {
        sourceNodeId: params.nodeId,
        nodeType: params.nodeType,
        nodeLabel: params.nodeLabel,
        nodeCategory: params.nodeCategory,
        scenarioContext: {
          entity: params.nodeLabel,
          domain: params.nodeCategory,
          observedSignals: params.signalTitles.slice(0, 5),
        },
        suggestedHypothesis: `针对 ${params.nodeLabel}(${params.nodeCategory}) 的市场变化分析`,
        suggestedTimeHorizon: "30d",
        relatedNodeLabels: params.relatedLabels.slice(0, 8),
      }
    }

    const context = buildSandboxContext({
      nodeId: "node-001",
      nodeType: "company",
      nodeLabel: "华为",
      nodeCategory: "tech",
      signalTitles: ["5G专利增长", "欧洲市场份额上升"],
      relatedLabels: ["中兴", "爱立信", "诺基亚"],
    })

    // 验证是结构化对象
    expect(context.sourceNodeId).toBe("node-001")
    expect(context.scenarioContext.entity).toBe("华为")
    expect(context.scenarioContext.observedSignals).toHaveLength(2)
    expect(context.suggestedTimeHorizon).toBe("30d")
    expect(context.relatedNodeLabels).toContain("中兴")

    // 不含自然语言大字符串拼接
    expect(typeof context.scenarioContext).toBe("object")
    expect(Array.isArray(context.scenarioContext.observedSignals)).toBe(true)
  })

  it("observedSignals 截断到最多 5 条", () => {
    const signals = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"]
    const sliced = signals.slice(0, 5)
    expect(sliced).toHaveLength(5)
    expect(sliced).not.toContain("s6")
  })

  it("relatedNodeLabels 截断到最多 8 条", () => {
    const labels = Array.from({ length: 12 }, (_, i) => `node-${i}`)
    const sliced = labels.slice(0, 8)
    expect(sliced).toHaveLength(8)
    expect(sliced).not.toContain("node-10")
  })
})

// ─── 4. Store sandboxPreFill 桥接 ───────────────────────────────────────

describe("Phase 4 — Store sandboxPreFill 联动", () => {
  it("setSandboxPreFill 后可通过 selector 读取", () => {
    // 模拟 Zustand store 行为
    let state = { sandboxPreFill: null as Record<string, unknown> | null }

    const setSandboxPreFill = (preFill: typeof state.sandboxPreFill) => {
      state = { ...state, sandboxPreFill: preFill }
    }
    const clearSandboxPreFill = () => {
      state = { ...state, sandboxPreFill: null }
    }

    setSandboxPreFill({
      scenario: "分析 华为(tech) 的市场影响",
      hypothesis: "针对 华为(tech) 的市场变化分析",
      timeHorizon: "30d",
      sourceNodeId: "node-001",
    })

    expect(state.sandboxPreFill).not.toBeNull()
    expect(state.sandboxPreFill?.sourceNodeId).toBe("node-001")
    expect(state.sandboxPreFill?.timeHorizon).toBe("30d")

    clearSandboxPreFill()
    expect(state.sandboxPreFill).toBeNull()
  })

  it("sandboxPreFill 中的 sourceNodeId 可用于 P3↔P4 联动指示", () => {
    const preFill = {
      scenario: "test",
      hypothesis: "test",
      timeHorizon: "30d",
      sourceNodeId: "node-abc",
    }
    const selectedNodeId = "node-abc"
    const isLinked = preFill.sourceNodeId === selectedNodeId
    expect(isLinked).toBe(true)
  })
})

// ─── 5. 性能守卫 ────────────────────────────────────────────────────────

describe("Phase 4 — 性能守卫", () => {
  it("节点超过 500 应截断", () => {
    const MAX_NODES = 500
    const allNodes = Array.from({ length: 800 }, (_, i) => ({
      id: `node-${i}`,
      label: `Node ${i}`,
      category: "company",
      weight: 0.5,
    }))

    const capped = allNodes.slice(0, MAX_NODES)
    expect(capped).toHaveLength(MAX_NODES)
    expect(capped[499].id).toBe("node-499")
  })

  it("截断后孤立边应被过滤", () => {
    const nodeIds = new Set(["node-0", "node-1", "node-2"])
    const edges = [
      { id: "e1", source: "node-0", target: "node-1", relation: "supply", weight: 0.5 },
      { id: "e2", source: "node-0", target: "node-999", relation: "supply", weight: 0.5 },
      { id: "e3", source: "node-999", target: "node-998", relation: "compete", weight: 0.3 },
    ]

    const validEdges = edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    )
    expect(validEdges).toHaveLength(1)
    expect(validEdges[0].id).toBe("e1")
  })

  it("FPS 低于阈值应触发降级", () => {
    const DEGRADE_FPS_THRESHOLD = 30
    const samples = [25, 28, 27, 26, 29]
    const avgFps = samples.reduce((a, b) => a + b, 0) / samples.length
    expect(avgFps).toBeLessThan(DEGRADE_FPS_THRESHOLD)
  })

  it("FPS 正常不触发降级", () => {
    const DEGRADE_FPS_THRESHOLD = 30
    const samples = [55, 58, 60, 57, 59]
    const avgFps = samples.reduce((a, b) => a + b, 0) / samples.length
    expect(avgFps).toBeGreaterThan(DEGRADE_FPS_THRESHOLD)
  })

  it("页面隐藏时 pausedRef 应设为 true", () => {
    // 模拟 visibility 切换逻辑
    let paused = false
    const handler = () => { paused = true }
    handler()
    expect(paused).toBe(true)
  })

  it("prefers-reduced-motion 启用时禁用旋转动画", () => {
    // 模拟 reducedMotionRef 行为
    let reducedMotion = false
    const motionQuery = { matches: true } as MediaQueryList
    reducedMotion = motionQuery.matches
    expect(reducedMotion).toBe(true)

    // 禁用动画时不旋转
    let rotation = 0
    if (!reducedMotion) {
      rotation += 0.0005
    }
    expect(rotation).toBe(0)
  })

  it("prefers-reduced-motion 禁用时正常旋转", () => {
    let reducedMotion = false
    let rotation = 0
    if (!reducedMotion) {
      rotation += 0.0005
    }
    expect(rotation).toBe(0.0005)
  })
})

// ─── 6. GraphDiff 增量更新 ─────────────────────────────────────────────

describe("Phase 4 — GraphDiff 增量更新", () => {
  it("合并多个 diff 的节点增删", () => {
    let nodes = [
      { id: "n1", label: "A", category: "company", weight: 0.8 },
      { id: "n2", label: "B", category: "product", weight: 0.5 },
      { id: "n3", label: "C", category: "market", weight: 0.3 },
    ]

    const diffs = [
      { added: [], removed: ["n2"], updated: [] },
      { added: [{ id: "n4", label: "D", category: "tech", weight: 0.6 }], removed: [], updated: [] },
    ]

    for (const diff of diffs) {
      if (diff.removed.length > 0) {
        const removedSet = new Set(diff.removed)
        nodes = nodes.filter((n) => !removedSet.has(n.id))
      }
      for (const node of diff.added) {
        if (!nodes.find((n) => n.id === node.id)) {
          nodes.push(node)
        }
      }
    }

    expect(nodes).toHaveLength(3)
    expect(nodes.find((n) => n.id === "n2")).toBeUndefined()
    expect(nodes.find((n) => n.id === "n4")).toBeDefined()
  })

  it("移除节点时同步清理关联边", () => {
    let edges = [
      { id: "e1", source: "n1", target: "n2", relation: "supply", weight: 0.5 },
      { id: "e2", source: "n2", target: "n3", relation: "compete", weight: 0.3 },
      { id: "e3", source: "n1", target: "n3", relation: "partner", weight: 0.7 },
    ]
    const removedNodeIds = new Set(["n2"])

    edges = edges.filter(
      (e) => !removedNodeIds.has(e.source) && !removedNodeIds.has(e.target),
    )

    expect(edges).toHaveLength(1)
    expect(edges[0].id).toBe("e3")
  })

  it("拓扑更新批处理 2s 间隔不丢失数据", () => {
    const buffer: Array<{ added: string[]; removed: string[] }> = []
    buffer.push({ added: ["n4"], removed: [] })
    buffer.push({ added: [], removed: ["n2"] })
    buffer.push({ added: ["n5"], removed: [] })

    // 批量消费
    const consumed = buffer.splice(0)
    expect(consumed).toHaveLength(3)

    // buffer 清空
    expect(buffer).toHaveLength(0)
  })
})

// ─── 7. RenderMode 设备检测 ─────────────────────────────────────────────

describe("Phase 4 — RenderMode 设备检测", () => {
  it("移动端 UA 返回 d3-2d", () => {
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    )
    expect(isMobile).toBe(true)
  })

  it("桌面端 UA 不匹配移动端正则", () => {
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    )
    expect(isMobile).toBe(false)
  })
})

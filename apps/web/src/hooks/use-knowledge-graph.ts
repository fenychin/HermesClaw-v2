/**
 * useKnowledgeGraph — 知识图谱全量 + diff 增量 Hook
 *
 * 流程：
 * 1. 全量初始化：GET /api/v1/industry/knowledge-graph → Worker 布局 → 渲染
 * 2. 增量更新：通过 IntelStreamContext 订阅 topology.updated 事件 → GraphDiff → 局部更新图谱
 *
 * PERF(v3.42.05): 不再自己创建 SSE 连接，通过 IntelStreamContext 订阅页面级共享流。
 *
 * 性能约束：最多 500 节点，超限自动截断。
 */
"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useContainerSize } from "@/hooks/use-container-size"
import { fetchKnowledgeGraph } from "@/services/api/industry-intel-api"
import { intelEventBus } from "@/contexts/intel-event-bus"
import type { IntelTopologyUpdated } from "@/types/industry-intel"
import type {
  GraphNode,
  GraphEdge,
  GraphDiff,
  ForceLayoutResult,
} from "@/types/nebula-graph"

const MAX_NODES = 500

interface UseKnowledgeGraphOptions {
  packId: string | null
  /** 容器 ref，用于获取真实尺寸传递给 Worker */
  containerRef?: React.RefObject<HTMLDivElement | null>
}

interface UseKnowledgeGraphReturn {
  /** 全量图谱节点 */
  nodes: GraphNode[]
  /** 全量图谱边 */
  edges: GraphEdge[]
  /** 布局结果（由 Worker 计算） */
  layout: ForceLayoutResult | null
  /** 是否正在加载全量图谱 */
  isLoading: boolean
  /** 加载错误 */
  error: string | null
  /** 最近的 diff 更新 */
  lastDiff: GraphDiff | null
  /** 手动请求重新布局 */
  requestLayout: () => void
}

export function useKnowledgeGraph({
  packId,
  containerRef,
}: UseKnowledgeGraphOptions): UseKnowledgeGraphReturn {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [layout, setLayout] = useState<ForceLayoutResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastDiff, setLastDiff] = useState<GraphDiff | null>(null)

  const containerSize = useContainerSize(containerRef)

  const workerRef = useRef<Worker | null>(null)
  const layoutRequestedRef = useRef(false)

  // PERF(v3.42.05): 独立订阅事件总线——只监听 topology 事件
  const topologyUpdatesRef = useRef<GraphDiff[]>([])

  useEffect(() => intelEventBus.on("topology", (event: unknown) => {
    const e = event as unknown as { added?: GraphNode[]; removed?: string[]; updated?: GraphEdge[] }
    const diff: GraphDiff = {
      added: e.added ?? [],
      removed: e.removed ?? [],
      updated: e.updated ?? [],
    }
    topologyUpdatesRef.current.push(diff)
    if (topologyUpdatesRef.current.length > 20) {
      topologyUpdatesRef.current = topologyUpdatesRef.current.slice(-20)
    }
    setLastDiff(diff)
  }), [])

  // 全量加载
  const loadFullGraph = useCallback(async () => {
    if (!packId) return
    setIsLoading(true)
    setError(null)

    try {
      const graph = await fetchKnowledgeGraph(packId)
      const cappedNodes = graph.nodes.slice(0, MAX_NODES)
      const nodeIds = new Set(cappedNodes.map((n) => n.id))
      const cappedEdges = graph.edges.filter(
        (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
      )

      setNodes(cappedNodes as GraphNode[])
      setEdges(cappedEdges as GraphEdge[])
      layoutRequestedRef.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : "图谱加载失败")
    } finally {
      setIsLoading(false)
    }
  }, [packId])

  // 增量 diff 合并
  useEffect(() => {
    const interval = setInterval(() => {
      const diffs = topologyUpdatesRef.current
      if (diffs.length === 0) return
      topologyUpdatesRef.current = []

      setNodes((prev) => {
        let updated = [...prev]

        for (const diff of diffs) {
          // 移除
          if (diff.removed.length > 0) {
            const removedSet = new Set(diff.removed)
            updated = updated.filter((n) => !removedSet.has(n.id))
          }
          // 新增
          for (const node of diff.added) {
            if (updated.length >= MAX_NODES) break
            if (!updated.find((n) => n.id === node.id)) {
              updated.push(node)
            }
          }
        }

        return updated
      })

      setEdges((prev) => {
        let updated = [...prev]

        for (const diff of diffs) {
          // 移除孤立边
          if (diff.removed.length > 0) {
            const removedSet = new Set(diff.removed)
            updated = updated.filter(
              (e) => !removedSet.has(e.source) && !removedSet.has(e.target),
            )
          }
          // 更新/新增边
          for (const edge of diff.updated) {
            const existingIdx = updated.findIndex((e) => e.id === edge.id)
            if (existingIdx >= 0) {
              updated[existingIdx] = edge
            } else {
              updated.push(edge)
            }
          }
        }

        return updated
      })

      // 有新数据需要重新布局
      if (diffs.some((d) => d.added.length > 0 || d.removed.length > 0 || d.updated.length > 0)) {
        layoutRequestedRef.current = true
      }
    }, 2000) // 2s 批处理间隔

    return () => clearInterval(interval)
  }, [])

  // 初始加载
  useEffect(() => {
    if (packId) {
      loadFullGraph()
    }
  }, [packId, loadFullGraph])

  // Worker 布局
  const requestLayout = useCallback(() => {
    layoutRequestedRef.current = true
  }, [])

  useEffect(() => {
    if (!layoutRequestedRef.current || nodes.length === 0) return
    layoutRequestedRef.current = false

    // 创建 Worker（如不存在）
    if (!workerRef.current) {
      try {
        workerRef.current = new Worker(
          new URL("@/workers/nebula-layout.worker.ts", import.meta.url),
        )
      } catch {
        // Worker 创建失败，静默降级
        return
      }
    }

    const worker = workerRef.current

    worker.onmessage = (e: MessageEvent<{ type: string; result: ForceLayoutResult }>) => {
      if (e.data.type === "layout-result") {
        setLayout(e.data.result)
      }
    }

    worker.postMessage({
      type: "layout",
      nodes: nodes.map((n) => ({ id: n.id, weight: n.weight, category: n.category })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        weight: e.weight,
      })),
      options: {
        width: containerSize.width,
        height: containerSize.height,
        depth: Math.min(containerSize.width, containerSize.height) * 0.8,
      },
    })
  }, [nodes, edges])

  // 清理 Worker
  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  return {
    nodes,
    edges,
    layout,
    isLoading,
    error,
    lastDiff,
    requestLayout,
  }
}

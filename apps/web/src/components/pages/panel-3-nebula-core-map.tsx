/**
 * Panel3NebulaCoreMap — 行业生态全景星云面板 (P3)
 *
 * Phase 4: Three.js 3D 力导向图 + D3 2D 降级 + Web Worker 布局。
 * 节点点击 → NodeDetailPopover → 可升级到沙盘推演。
 *
 * 三域原则：不在此做图谱语义计算，只做渲染与交互。
 * 性能守卫：500 节点上限、<30fps 自动降级、页面隐藏暂停。
 */
"use client"

import React, { useRef, useMemo, useCallback, useState } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useKnowledgeGraph } from "@/hooks/use-knowledge-graph"
import { useNebulaRender } from "@/hooks/use-nebula-render"
import { useIndustryIntelStore } from "@/stores/industry-intel-store"
import type { NodeToSandboxContext } from "@/types/nebula-graph"

// 延迟加载浮层，不影响首帧
const NodeDetailPopover = dynamic(
  () =>
    import(
      "@/views/industry-intelligence/panels/Panel3NebulaCoreMap/node-detail-popover"
    ).then((m) => ({ default: m.NodeDetailPopover })),
  { ssr: false },
)

// ─── 分类颜色 ──────────────────────────────────────────────────────────

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

// ─── 主组件 ────────────────────────────────────────────────────────────

export function Panel3NebulaCoreMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null)

  const activeIndustryId = useIndustryIntelStore((s) => s.activeIndustryId)
  const setSandboxPreFill = useIndustryIntelStore((s) => s.setSandboxPreFill)
  const sandboxPreFill = useIndustryIntelStore((s) => s.sandboxPreFill)

  // 图谱数据 + Worker 布局
  const { nodes, edges, layout, isLoading, error } = useKnowledgeGraph({
    packId: activeIndustryId,
  })

  // 渲染引擎
  const { renderMode, perf, selectedNodeId, hoveredNodeId, selectNode, forceDegrade } =
    useNebulaRender({
      layout,
      nodes,
      edges,
      containerRef,
      onNodeClick: useCallback(
        (nodeId: string) => {
          // 在容器内计算 popover 位置（用鼠标位置）
          // 此处用 containerRef 中心作为回退
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            setPopoverPos({ x: rect.width / 2, y: rect.height / 2 })
          }
        },
        [],
      ),
      onNodeHover: useCallback((_nodeId: string | null) => {
        // hover 仅用于渲染高亮，不需要额外处理
      }, []),
    })

  // 选中节点详情
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )

  const selectedDetail = useMemo(() => {
    if (!selectedNodeId || !layout || !selectedNode) return null
    const relatedEdges = layout.edges
      .filter((e) => e.source === selectedNodeId || e.target === selectedNodeId)
      .map((e) => {
        const otherId = e.source === selectedNodeId ? e.target : e.source
        const otherNode = nodes.find((n) => n.id === otherId)
        return otherNode
          ? { edge: e, otherNode: { id: otherNode.id, label: otherNode.label, category: otherNode.category, weight: otherNode.weight } }
          : null
      })
      .filter(Boolean)
      .slice(0, 6) as Array<{
      edge: (typeof layout.edges)[0]
      otherNode: { id: string; label: string; category: string; weight: number }
    }>

    return {
      node: selectedNode,
      relatedEdges,
      recentEvents: [],
    }
  }, [selectedNodeId, layout, nodes, selectedNode])

  // 升级到沙盘
  const handleUpgradeToSandbox = useCallback(
    (context: NodeToSandboxContext) => {
      setSandboxPreFill({
        scenario: `分析 ${context.nodeLabel} (${context.nodeCategory}) 的市场影响`,
        hypothesis: context.suggestedHypothesis,
        timeHorizon: context.suggestedTimeHorizon,
        sourceNodeId: context.sourceNodeId,
      })
      setPopoverPos(null)
      selectNode(null)
    },
    [setSandboxPreFill, selectNode],
  )

  // 关闭浮层
  const handleClosePopover = useCallback(() => {
    setPopoverPos(null)
    selectNode(null)
  }, [selectNode])

  // 性能指示器
  const perfLabel = useMemo(() => {
    if (renderMode === "d3-2d") return `${perf.fps}FPS 2D`
    return `${perf.fps}FPS 3D`
  }, [renderMode, perf.fps])

  // 连接指示
  const sandboxLinked = sandboxPreFill?.sourceNodeId === selectedNodeId

  return (
    <Card
      className="h-full border-zinc-800 bg-zinc-950/60 flex flex-col relative overflow-hidden"
      aria-label="行业生态全景星云面板"
    >
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-sm font-medium text-zinc-300 flex items-center justify-between">
          <span>行业生态全景星云</span>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-mono ${
                perf.fps < 30 ? "text-amber-400" : "text-zinc-500"
              }`}
              title={`节点:${perf.nodeCount} 边:${perf.edgeCount} 帧时间:${perf.frameTimeMs}ms`}
            >
              {perfLabel}
            </span>
            {renderMode === "three-3d" && perf.fps < 45 && (
              <button
                onClick={forceDegrade}
                className="text-[10px] text-amber-400 hover:text-amber-300 underline"
                title="手动降级到 2D 渲染"
              >
                降级
              </button>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 relative overflow-hidden pt-0">
        {/* 加载态 */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-zinc-950/80">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-zinc-500">加载知识图谱…</p>
            </div>
          </div>
        )}

        {/* 错误态 */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-zinc-950/80">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* 空态 */}
        {!isLoading && !error && nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-zinc-600">暂无图谱数据</p>
          </div>
        )}

        {/* 渲染容器 */}
        <div ref={containerRef} className="absolute inset-0" />

        {/* 节点详情浮层 */}
        {selectedNode && popoverPos && selectedDetail && (
          <NodeDetailPopover
            node={selectedNode}
            detail={selectedDetail}
            position={popoverPos}
            onClose={handleClosePopover}
            onUpgradeToSandbox={handleUpgradeToSandbox}
          />
        )}

        {/* 已联动指示 */}
        {sandboxLinked && (
          <div className="absolute bottom-2 left-2 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1">
            ← 已联动沙盘推演
          </div>
        )}

        {/* 图例 */}
        <div className="absolute bottom-2 right-2 flex flex-wrap gap-1.5 text-[9px] text-zinc-500">
          {Object.entries(CATEGORY_COLORS).slice(0, 6).map(([cat, color]) => (
            <span key={cat} className="flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              {cat}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

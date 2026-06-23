/**
 * NodeDetailPopover — 节点详情浮层
 *
 * 点击星云节点后弹出：节点摘要、最近事件、关联关系、
 * "升级到沙盘推演"联动按钮。
 *
 * 三域原则：不在此组件做图谱语义计算，只展示服务端返回的数据。
 */
"use client"

import React, { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { GraphNode, SelectedNodeDetail, NodeToSandboxContext } from "@/types/nebula-graph"

// ─── 分类名称映射 ──────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  company: "企业",
  product: "产品",
  policy: "政策",
  market: "市场",
  region: "区域",
  capital: "资本",
  tech: "技术",
  energy: "能源",
  trade: "贸易",
}

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat
}

// ─── 构建沙盘联动输入 ──────────────────────────────────────────────────

function buildSandboxContext(
  node: GraphNode,
  detail: SelectedNodeDetail | null,
): NodeToSandboxContext {
  const relatedLabels = detail?.relatedEdges.map((r) => r.otherNode.label) ?? []
  const signalTitles = detail?.recentEvents.map((e) => e.title) ?? []

  return {
    sourceNodeId: node.id,
    nodeType: node.category,
    nodeLabel: node.label,
    nodeCategory: node.category,
    scenarioContext: {
      entity: node.label,
      domain: categoryLabel(node.category),
      observedSignals: signalTitles.slice(0, 5),
    },
    suggestedHypothesis: `针对 ${node.label}(${categoryLabel(node.category)}) 的市场变化分析`,
    suggestedTimeHorizon: "30d",
    relatedNodeLabels: relatedLabels.slice(0, 8),
  }
}

// ─── 子组件 ────────────────────────────────────────────────────────────

function EventRow({
  title,
  timestamp,
  threatLevel,
}: {
  title: string
  timestamp: string
  threatLevel?: string
}) {
  const levelColor =
    threatLevel === "HIGH" || threatLevel === "CRITICAL"
      ? "text-red-400"
      : threatLevel === "MEDIUM"
        ? "text-amber-400"
        : "text-zinc-500"

  return (
    <div className="flex items-center justify-between text-[10px] py-0.5">
      <span className={`truncate flex-1 ${levelColor}`}>{title}</span>
      <span className="text-zinc-600 ml-2 shrink-0">
        {new Date(timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  )
}

// ─── 主组件 ────────────────────────────────────────────────────────────

interface NodeDetailPopoverProps {
  node: GraphNode
  detail: SelectedNodeDetail | null
  position: { x: number; y: number } | null
  onClose: () => void
  onUpgradeToSandbox: (context: NodeToSandboxContext) => void
}

export function NodeDetailPopover({
  node,
  detail,
  position,
  onClose,
  onUpgradeToSandbox,
}: NodeDetailPopoverProps) {
  const sandboxContext = useMemo(
    () => buildSandboxContext(node, detail),
    [node, detail],
  )

  if (!position) return null

  // 确保浮层不超出视口
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1024
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 768
  const popoverW = 260
  const popoverH = 320
  const x = Math.min(position.x + 12, viewportW - popoverW - 16)
  const y = Math.min(position.y - popoverH / 2, viewportH - popoverH - 16)

  return (
    <div
      className="absolute z-50 w-[260px] max-h-[320px] overflow-auto rounded-lg border border-zinc-700 bg-zinc-900/95 backdrop-blur shadow-xl"
      style={{ left: x, top: Math.max(y, 8) }}
      role="dialog"
      aria-label={`节点详情: ${node.label}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-zinc-200 truncate">
            {node.label}
          </span>
          <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">
            {categoryLabel(node.category)}
          </Badge>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 shrink-0 ml-2"
          aria-label="关闭详情"
        >
          ✕
        </button>
      </div>

      {/* 内容 */}
      <div className="px-3 py-2 space-y-2.5">
        {/* 基本信息 */}
        <section aria-label="节点基本信息">
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <div>
              <span className="text-zinc-500">ID</span>
              <p className="text-zinc-300 font-mono truncate">{node.id}</p>
            </div>
            <div>
              <span className="text-zinc-500">权重</span>
              <p className="text-zinc-300">
                {node.weight !== undefined ? Math.round(node.weight * 100) : "-"}%
              </p>
            </div>
          </div>
        </section>

        {/* 关联关系 */}
        {detail && detail.relatedEdges.length > 0 && (
          <section aria-label="关联关系">
            <h5 className="text-[10px] text-zinc-500 mb-1">关联关系</h5>
            <div className="space-y-0.5 max-h-24 overflow-auto">
              {detail.relatedEdges.slice(0, 6).map((r, i) => (
                <div key={i} className="flex items-center gap-1 text-[10px]">
                  <span className="text-zinc-300 truncate">{r.otherNode.label}</span>
                  <span className="text-zinc-600">— {r.edge.relation}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 最近事件 */}
        {detail && detail.recentEvents.length > 0 && (
          <section aria-label="最近事件">
            <h5 className="text-[10px] text-zinc-500 mb-1">
              最近事件 ({detail.recentEvents.length})
            </h5>
            <div className="space-y-0.5 max-h-20 overflow-auto">
              {detail.recentEvents.slice(0, 5).map((evt, i) => (
                <EventRow
                  key={i}
                  title={evt.title}
                  timestamp={evt.timestamp}
                  threatLevel={evt.threatLevel}
                />
              ))}
            </div>
          </section>
        )}

        {/* 无详情数据 */}
        {(!detail || (detail.relatedEdges.length === 0 && detail.recentEvents.length === 0)) && (
          <p className="text-[10px] text-zinc-600 italic">暂无详细数据</p>
        )}

        {/* 升级到沙盘推演 */}
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-[10px] border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
          onClick={() => onUpgradeToSandbox(sandboxContext)}
          aria-label={`将 ${node.label} 升级到沙盘推演`}
        >
          ↑ 升级到沙盘推演
        </Button>
      </div>
    </div>
  )
}

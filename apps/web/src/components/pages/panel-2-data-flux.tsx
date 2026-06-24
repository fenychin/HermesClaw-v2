/**
 * Panel2DataFlux — 数据流量与动力学面板 (P2)
 *
 * 展示资金流向曲线 + 市场趋势 + 数据源健康。
 * 使用环形缓冲区：本地保留最近 300 条 flow tick。
 */
"use client"

import React, { useMemo, useEffect, useState } from "react"
import { useIntelSnapshot } from "@/hooks/use-intel-snapshot"
import { intelEventBus } from "@/contexts/intel-event-bus"
import { useIndustryIntelStore } from "@/stores/industry-intel-store"
import { fetchConnectorHealth } from "@/services/api/industry-intel-api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { IntelFlowTick, ConnectorHealthItem } from "@/types/industry-intel"

// ─── 静态占位曲线 ──────────────────────────────────────────────────────

function generatePlaceholderCurve(): number[] {
  const points: number[] = []
  let val = 50
  for (let i = 0; i < 60; i++) {
    val += (Math.random() - 0.5) * 8
    val = Math.max(0, Math.min(100, val))
    points.push(Math.round(val))
  }
  return points
}

const PLACEHOLDER_CURVE = generatePlaceholderCurve()

// ─── 子组件 ────────────────────────────────────────────────────────────

function MiniCurve({
  data,
  label,
  color,
}: {
  data: number[]
  label: string
  color: string
}) {
  const maxVal = Math.max(...data, 1)

  // 生成平滑贝塞尔路径 (catmull-rom → cubic bezier)
  const pathD = useMemo(() => {
    if (data.length < 2) return ""
    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * 100,
      y: 100 - (v / maxVal) * 60,
    }))

    let d = `M${pts[0].x},${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[Math.min(pts.length - 1, i + 2)]
      const tension = 0.3
      const cp1x = p1.x + (p2.x - p0.x) * tension
      const cp1y = p1.y + (p2.y - p0.y) * tension
      const cp2x = p2.x - (p3.x - p1.x) * tension
      const cp2y = p2.y - (p3.y - p1.y) * tension
      d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
    }
    return d
  }, [data, maxVal])

  return (
    <div className="flex-1 min-w-0" aria-label={`${label} 趋势曲线`}>
      <span className="text-[10px] text-zinc-500 block mb-0.5">{label}</span>
      <svg
        viewBox="0 0 100 60"
        className="w-full h-12"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* 渐变填充区域 */}
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={pathD + ` L100,60 L0,60 Z`}
          fill={`url(#grad-${label})`}
        />
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function ConnectorStatusBadge({ item }: { item: ConnectorHealthItem }) {
  const statusColor =
    item.status === "healthy"
      ? "bg-emerald-500/20 text-emerald-400"
      : item.status === "degraded"
        ? "bg-amber-500/20 text-amber-400"
        : "bg-red-500/20 text-red-400"

  return (
    <div className={`flex items-center justify-between px-2 py-1 rounded text-[10px] ${statusColor}`} aria-label={`${item.name}: ${item.status}`}>
      <span className="truncate">{item.name}</span>
      <span className="ml-1 font-mono">{item.latencyMs}ms</span>
    </div>
  )
}

// ─── 主组件 ────────────────────────────────────────────────────────────

export function Panel2DataFlux() {
  const activeIndustryId = useIndustryIntelStore((s) => s.activeIndustryId)
  const { snapshot, isLoading: snapshotLoading } = useIntelSnapshot({ packId: activeIndustryId })
  // PERF(v3.42.05): 独立订阅事件总线——只监听 flow.tick 事件
  const [flowTicks, setFlowTicks] = useState<IntelFlowTick[]>([])
  useEffect(() => intelEventBus.on("flow.tick", (e) => {
    setFlowTicks((prev) => [...prev.slice(-299), e as IntelFlowTick])
  }), [])
  const connectorHealth = useIndustryIntelStore((s) => s.connectorHealth)
  const setConnectorHealth = useIndustryIntelStore((s) => s.setConnectorHealth)

  // 环形缓冲区：最近 300 条 tick
  const tickBuffer = useMemo(() => {
    return flowTicks.slice(-300)
  }, [flowTicks])

  // 用 tick 数据生成曲线
  const capitalFlowData = useMemo(() => {
    if (tickBuffer.length > 5) {
      return tickBuffer.map((t) => {
        const tick = t as unknown as Record<string, number>
        return tick.capitalFlowIndex ?? 50
      })
    }
    return PLACEHOLDER_CURVE
  }, [tickBuffer])

  const volumeData = useMemo(() => {
    if (tickBuffer.length > 5) {
      return tickBuffer.map((t) => {
        const tick = t as unknown as Record<string, number>
        return tick.volumeIndex ?? 50
      })
    }
    return PLACEHOLDER_CURVE.map(v => Math.max(0, Math.min(100, v + (Math.random() - 0.5) * 20)))
  }, [tickBuffer])

  // 拉取连接器健康状态
  useEffect(() => {
    fetchConnectorHealth()
      .then(setConnectorHealth)
      .catch(() => { /* 静默降级 */ })
  }, [setConnectorHealth])

  const systemStatus = snapshot?.systemStatus

  return (
    <Card className="h-full border-zinc-800 bg-zinc-950/60 flex flex-col" aria-label="数据流量与动力学面板">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-300 flex items-center justify-between">
          <span>数据流量动力学</span>
          <span className="text-[10px] text-zinc-600 font-mono">
            BUFFER {tickBuffer.length}/300
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 overflow-auto pt-0">
        {/* 资金流向曲线 */}
        <section aria-label="资金流向曲线">
          <h4 className="text-[11px] text-zinc-500 mb-1">资金流向</h4>
          {snapshotLoading && tickBuffer.length === 0 ? (
            <Skeleton className="h-14 w-full bg-zinc-800" />
          ) : (
            <div className="flex gap-2">
              <MiniCurve data={capitalFlowData} label="资本流动指数" color="#10b981" />
              <MiniCurve data={volumeData} label="成交量指数" color="#3b82f6" />
            </div>
          )}
        </section>

        {/* 系统状态摘要 */}
        {systemStatus && (
          <section aria-label="系统运行状态">
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="flex justify-between px-2 py-1 bg-zinc-900/50 rounded">
                <span className="text-zinc-500">状态</span>
                <span className={`${systemStatus === "OPERATIONAL" ? "text-emerald-400" : systemStatus === "DEGRADED" ? "text-amber-400" : "text-red-400"}`}>
                  {systemStatus}
                </span>
              </div>
              <div className="flex justify-between px-2 py-1 bg-zinc-900/50 rounded">
                <span className="text-zinc-500">置信度</span>
                <span className="text-zinc-300">{snapshot?.modelConfidence?.toFixed(1) ?? "-"}%</span>
              </div>
            </div>
          </section>
        )}

        {/* 数据源连接器健康 */}
        <section aria-label="连接器健康状态">
          <h4 className="text-[11px] text-zinc-500 mb-1">数据源健康</h4>
          <div className="space-y-1">
            {connectorHealth.length === 0 ? (
              <p className="text-[10px] text-zinc-500 italic">检测中…</p>
            ) : (
              connectorHealth.map((item) => (
                <ConnectorStatusBadge key={item.connectorId} item={item} />
              ))
            )}
          </div>
        </section>
      </CardContent>
    </Card>
  )
}

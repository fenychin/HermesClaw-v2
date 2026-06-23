/**
 * Panel2DataFlux — 数据流量与动力学面板 (P2)
 *
 * 展示资金流向曲线 + 市场趋势 + 数据源健康。
 * 使用环形缓冲区：本地保留最近 300 条 flow tick。
 */
"use client"

import React, { useMemo } from "react"
import { useIntelSnapshot } from "@/hooks/use-intel-snapshot"
import { useIntelStream } from "@/hooks/use-intel-stream"
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
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${100 - (v / maxVal) * 60}`)
    .join(" ")

  return (
    <div className="flex-1 min-w-0" aria-label={`${label} 趋势曲线`}>
      <span className="text-[10px] text-zinc-500 block mb-0.5">{label}</span>
      <svg
        viewBox="0 0 100 60"
        className="w-full h-12"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline
          points={points}
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
  const { flowTicks } = useIntelStream({ packId: activeIndustryId })
  const connectorHealth = useIndustryIntelStore((s) => s.connectorHealth)
  const setConnectorHealth = useIndustryIntelStore((s) => s.setConnectorHealth)

  // 环形缓冲区：最近 300 条 tick
  const tickBuffer = useMemo(() => {
    return flowTicks.slice(-300)
  }, [flowTicks])

  // 用 tick 数据生成曲线，或使用占位数据
  const curveData = useMemo(() => {
    if (tickBuffer.length > 5) {
      return tickBuffer.map((t) => {
        // 合约字段：capitalFlowIndex / volumeIndex 直属 IntelFlowTick
        const tick = t as unknown as Record<string, number>
        return tick.capitalFlowIndex ?? tick.volumeIndex ?? 50
      })
    }
    return PLACEHOLDER_CURVE
  }, [tickBuffer])

  // 拉取连接器健康状态
  React.useEffect(() => {
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
            <MiniCurve data={curveData} label="资本流动指数" color="#10b981" />
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
          {connectorHealth.length === 0 ? (
            <p className="text-[10px] text-zinc-600 italic">加载中…</p>
          ) : (
            <div className="space-y-1">
              {connectorHealth.map((item) => (
                <ConnectorStatusBadge key={item.connectorId} item={item} />
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  )
}

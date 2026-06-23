/**
 * Panel1StrategicAwareness — 战略态势感知面板 (P1)
 *
 * 展示 8 维雷达 + 政策热词矩阵 + 战术信号流。
 * Phase 3 使用静态数据 + API 双轨，API 返回后自动切换。
 */
"use client"

import React, { useMemo } from "react"
import { useIntelSnapshot } from "@/hooks/use-intel-snapshot"
import { useIntelStream } from "@/hooks/use-intel-stream"
import { useIndustryIntelStore } from "@/stores/industry-intel-store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { RadarDimension, IntelSignalDetected } from "@/types/industry-intel"

// ─── 静态占位数据（雷达无 API 数据时使用） ────────────────────────────────

const PLACEHOLDER_RADAR: RadarDimension[] = [
  { key: "policy-sensitivity", label: "政策敏感性", value: 72, delta: 5 },
  { key: "market-volatility", label: "市场波动性", value: 58, delta: 0 },
  { key: "competitor-activity", label: "竞对活跃度", value: 65, delta: 3 },
  { key: "compliance-risk", label: "合规风险度", value: 43, delta: -8 },
  { key: "tech-disruption", label: "技术变革速度", value: 81, delta: 12 },
  { key: "supply-chain-stability", label: "供应链稳定性", value: 55, delta: 0 },
  { key: "consumer-sentiment", label: "消费者情绪", value: 67, delta: 0 },
  { key: "capital-liquidity", label: "资本流动性", value: 49, delta: -4 },
]

// ─── 极坐标雷达图 ────────────────────────────────────────────────────────

function PolarRadar({ dimensions }: { dimensions: RadarDimension[] }) {
  const cx = 80, cy = 80, r = 68
  const levels = 4 // 4 个同心环（0, 25, 50, 75, 100）

  // 每个维度的弧度（从上开始，顺时针）
  const step = (2 * Math.PI) / dimensions.length
  const startAngle = -Math.PI / 2 // 12 点钟方向

  // 网格线（环形 + 射线）
  const gridCircles = Array.from({ length: levels }, (_, i) => {
    const lr = (r / levels) * (i + 1)
    return (
      <circle
        key={`grid-${i}`}
        cx={cx} cy={cy} r={lr}
        fill="none"
        stroke="rgb(39 39 42 / 0.6)"
        strokeWidth="0.5"
      />
    )
  })

  const gridLines = dimensions.map((_, i) => {
    const angle = startAngle + i * step
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    return (
      <line
        key={`ray-${i}`}
        x1={cx} y1={cy} x2={x} y2={y}
        stroke="rgb(39 39 42 / 0.6)"
        strokeWidth="0.5"
      />
    )
  })

  // 标签
  const labels = dimensions.map((dim, i) => {
    const angle = startAngle + i * step
    const lr = r + 14
    const x = cx + Math.cos(angle) * lr
    const y = cy + Math.sin(angle) * lr
    return (
      <text
        key={dim.key}
        x={x} y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-zinc-400 text-[6px]"
        fontSize="6"
      >
        {dim.label.length > 4 ? dim.label.slice(0, 4) : dim.label}
      </text>
    )
  })

  // 数据多边形 + 填充
  const dataPoints = dimensions.map((dim, i) => {
    const angle = startAngle + i * step
    const vr = (dim.value / 100) * r
    return { x: cx + Math.cos(angle) * vr, y: cy + Math.sin(angle) * vr }
  })
  const polyPoints = dataPoints.map(p => `${p.x},${p.y}`).join(" ")

  // 数据点圆
  const dataDots = dataPoints.map((p, i) => (
    <circle key={`dot-${i}`} cx={p.x} cy={p.y} r="2" fill="#3b82f6" />
  ))

  // 数值标签
  const valueLabels = dimensions.map((dim, i) => {
    const angle = startAngle + i * step
    const vr = (dim.value / 100) * r
    const x = cx + Math.cos(angle) * vr
    const y = cy + Math.sin(angle) * vr
    const offsetX = Math.cos(angle) * 8
    const offsetY = Math.sin(angle) * 8
    return (
      <text
        key={`val-${i}`}
        x={x + offsetX} y={y + offsetY}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-zinc-300 text-[5px]"
        fontSize="5"
      >
        {dim.value}
      </text>
    )
  })

  return (
    <svg viewBox="0 0 160 160" className="w-full h-40" aria-label="雷达图">
      {gridCircles}
      {gridLines}
      <polygon
        points={polyPoints}
        fill="rgba(59,130,246,0.12)"
        stroke="#3b82f6"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {dataDots}
      {labels}
      {valueLabels}
    </svg>
  )
}

function SignalItem({ signal }: { signal: IntelSignalDetected }) {
  const levelColor =
    signal.threatLevel === "L3"
      ? "border-red-500/50 bg-red-500/10"
      : signal.threatLevel === "L2"
        ? "border-orange-500/50 bg-orange-500/10"
        : "border-zinc-700 bg-zinc-900/50"

  return (
    <div className={`border rounded px-2.5 py-1.5 text-xs ${levelColor}`} role="listitem">
      <div className="flex items-center justify-between">
        <span className="text-zinc-300 truncate">{signal.title}</span>
        <span className="text-zinc-600 font-mono text-[10px]">{signal.threatLevel}</span>
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-zinc-500">
        <span>{signal.source ?? "—"}</span>
        <span>{(signal.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  )
}

// ─── 主组件 ────────────────────────────────────────────────────────────

export function Panel1StrategicAwareness() {
  const activeIndustryId = useIndustryIntelStore((s) => s.activeIndustryId)
  const { snapshot, isLoading } = useIntelSnapshot({ packId: activeIndustryId })
  const { signals } = useIntelStream({ packId: activeIndustryId })

  const radar = snapshot?.radarSection?.dimensions ?? PLACEHOLDER_RADAR

  // 热词：从 SSE signals 中提取 title 做词频统计
  const hotWords = useMemo(() => {
    if (signals.length === 0) {
      // 无信号时使用默认热词
      return [
        { word: "AI监管", heat: 94 },
        { word: "碳关税", heat: 87 },
        { word: "供应链回流", heat: 82 },
        { word: "数字人民币", heat: 76 },
        { word: "RCEP", heat: 71 },
      ]
    }
    // 从信号 title 中提取关键词
    const wordCount = new Map<string, number>()
    for (const s of signals.slice(0, 20)) {
      const words = s.title.split(/[\s,，、()（）\-—]+/).filter((w) => w.length >= 2)
      for (const w of words) {
        wordCount.set(w, (wordCount.get(w) ?? 0) + 1)
      }
    }
    return [...wordCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word, count]) => ({ word, heat: Math.min(99, 50 + count * 15) }))
  }, [signals])
  const displaySignals = signals.length > 0 ? signals.slice(0, 8) : []
  const snapshotTime = snapshot?.generatedAt
    ? new Date(snapshot.generatedAt).toLocaleTimeString("zh-CN")
    : null

  return (
    <Card className="h-full border-zinc-800 bg-zinc-950/60 flex flex-col" aria-label="战略态势感知面板">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-300 flex items-center justify-between">
          <span>战略态势感知</span>
          {snapshotTime && (
            <span className="text-[10px] text-zinc-600 font-normal">
              更新于 {snapshotTime}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 overflow-auto pt-0">
        {/* 8 维极坐标雷达 */}
        <section aria-label="8维雷达得分">
          <h4 className="text-[11px] text-zinc-500 mb-1.5">雷达得分</h4>
          {isLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full bg-zinc-800" />
              ))}
            </div>
          ) : (
            <PolarRadar dimensions={radar} />
          )}
        </section>

        {/* 政策热词矩阵 */}
        <section aria-label="政策热词矩阵">
          <h4 className="text-[11px] text-zinc-500 mb-1.5">政策热词</h4>
          <div className="flex flex-wrap gap-1.5" role="list">
            {hotWords.map((hw) => (
              <span
                key={hw.word}
                className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-300"
                role="listitem"
                aria-label={`${hw.word} 热度${hw.heat}`}
              >
                {hw.word}
                <span className="ml-1 text-zinc-600">{hw.heat}</span>
              </span>
            ))}
          </div>
        </section>

        {/* 战术信号流 */}
        <section aria-label="战术信号流">
          <h4 className="text-[11px] text-zinc-500 mb-1.5">
            战术信号 {displaySignals.length > 0 && `(${displaySignals.length})`}
          </h4>
          {displaySignals.length === 0 ? (
            <p className="text-xs text-zinc-600 italic">等待信号事件…</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-auto" role="list">
              {displaySignals.map((s, i) => (
                <SignalItem key={`${s.title}-${i}`} signal={s} />
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  )
}

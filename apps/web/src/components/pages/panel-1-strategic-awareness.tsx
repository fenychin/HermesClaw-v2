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

// ─── 静态占位数据（仅雷达无 API 数据时使用） ────────────────────────────

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

// ─── 子组件 ────────────────────────────────────────────────────────────

function RadarBar({ dim }: { dim: RadarDimension }) {
  const score = dim.value
  const barColor =
    score >= 70 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500"
  const deltaStr =
    dim.delta != null ? (dim.delta > 0 ? "↑" : dim.delta < 0 ? "↓" : "→") : "→"
  const deltaColor =
    dim.delta != null && dim.delta > 0 ? "text-red-400" : dim.delta != null && dim.delta < 0 ? "text-emerald-400" : "text-zinc-500"

  return (
    <div className="flex items-center gap-2 text-xs" role="listitem" aria-label={`${dim.label}: ${score}分`}>
      <span className="w-24 text-zinc-400 truncate" title={dim.label}>
        {dim.label}
      </span>
      <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="w-8 text-right text-zinc-300 font-mono">{score}</span>
      <span className={`w-5 text-center text-xs ${deltaColor}`}>{deltaStr}</span>
      {dim.delta != null && (
        <span className="w-8 text-right text-zinc-600 font-mono">{dim.delta > 0 ? "+" : ""}{dim.delta}</span>
      )}
    </div>
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
        {/* 8 维雷达 */}
        <section aria-label="8维雷达得分">
          <h4 className="text-[11px] text-zinc-500 mb-1.5">雷达得分</h4>
          {isLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full bg-zinc-800" />
              ))}
            </div>
          ) : (
            <div className="space-y-1" role="list">
              {radar.map((dim, i) => (
                <RadarBar key={dim.key || `radar-${i}`} dim={dim} />
              ))}
            </div>
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

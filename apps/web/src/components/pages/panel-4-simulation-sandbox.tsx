/**
 * Panel4SimulationSandbox — 决策推演沙盘面板 (P4)
 *
 * Phase 4 升级：路径高亮、胜率 Badge、sandboxPreFill 联动预填。
 * 自动化等级硬锁定 L1（仅执行用户提交的推演，不做自主决策）。
 *
 * 三域原则：不做任何领域判断，只做视图渲染。
 */
"use client"

import React, { useState, useEffect } from "react"
import { useSandboxSubmit } from "@/hooks/use-sandbox-submit"
import { useIndustryIntelStore } from "@/stores/industry-intel-store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { SandboxSubmitInput, ScenarioResult, PredictionPath } from "@/types/industry-intel"

// ─── 子组件：胜率 Badge ────────────────────────────────────────────────

function WinRateBadge({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100)
  let variant: "emerald" | "amber" | "red" = "red"
  if (pct >= 70) variant = "emerald"
  else if (pct >= 40) variant = "amber"

  const colorMap = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    red: "border-red-500/30 bg-red-500/10 text-red-400",
  }

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border ${colorMap[variant]}`}
      aria-label={`胜率 ${pct}%`}
    >
      {pct}%
    </span>
  )
}

// ─── 子组件：路径卡片（带高亮） ─────────────────────────────────────────

function PathCard({
  path,
  index,
  highlighted,
}: {
  path: PredictionPath
  index: number
  highlighted: boolean
}) {
  const labels = ["PATH_A 乐观", "PATH_B 基准", "PATH_C 悲观"]
  const colorBorders = [
    "border-emerald-500/30",
    "border-amber-500/30",
    "border-red-500/30",
  ]
  const bgColors = ["bg-emerald-500/5", "bg-amber-500/5", "bg-red-500/5"]
  const highlightBorder = highlighted ? "ring-1 ring-blue-400/60" : ""

  return (
    <div
      className={`border rounded-lg px-3 py-2.5 ${colorBorders[index]} ${bgColors[index]} ${highlightBorder} transition-all`}
      role="article"
      aria-label={`${labels[index]}，胜率 ${Math.round(path.winRate * 100)}%`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-medium text-zinc-300 truncate">
            {labels[index]}
          </span>
          {path.isRecommended && (
            <span className="text-[10px] text-emerald-400 shrink-0">★</span>
          )}
        </div>
        <WinRateBadge rate={path.winRate} />
      </div>

      {/* 胜率条 */}
      <div className="h-1.5 bg-zinc-800 rounded-full mb-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            path.winRate >= 0.7
              ? "bg-emerald-500"
              : path.winRate >= 0.4
                ? "bg-amber-500"
                : "bg-red-500"
          }`}
          style={{ width: `${path.winRate * 100}%` }}
        />
      </div>

      {/* 数据点 */}
      {path.data && path.data.length > 0 && (
        <div className="space-y-0.5">
          {path.data.slice(0, 3).map((dp, i) => (
            <div key={i} className="flex justify-between text-[10px]">
              <span className="text-zinc-500">{dp.t}</span>
              <span className="text-zinc-300 font-mono">{dp.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 主组件 ────────────────────────────────────────────────────────────

export function Panel4SimulationSandbox() {
  const [scenario, setScenario] = useState("")
  const [hypothesis, setHypothesis] = useState("")
  const [timeHorizon, setTimeHorizon] = useState("30d")
  const [submitted, setSubmitted] = useState(false)

  const { isRunning, result, error, submit, reset } = useSandboxSubmit()
  const sandboxPreFill = useIndustryIntelStore((s) => s.sandboxPreFill)
  const clearSandboxPreFill = useIndustryIntelStore((s) => s.clearSandboxPreFill)

  // 从 store 的 sandboxPreFill 预填表单（Panel3 节点→沙盘联动）
  useEffect(() => {
    if (sandboxPreFill && !submitted) {
      if (sandboxPreFill.scenario) setScenario(sandboxPreFill.scenario)
      if (sandboxPreFill.hypothesis) setHypothesis(sandboxPreFill.hypothesis)
      if (sandboxPreFill.timeHorizon) setTimeHorizon(sandboxPreFill.timeHorizon)
    }
  }, [sandboxPreFill, submitted])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scenario.trim() || !hypothesis.trim()) return

    const request: SandboxSubmitInput = {
      packId: "industry-intelligence-v2",
      scenario: scenario.trim(),
      hypothesis: hypothesis.trim(),
      timeHorizon: timeHorizon.trim(),
      automationLevel: "L1",
    }

    setSubmitted(true)
    clearSandboxPreFill()
    await submit(request)
  }

  const handleReset = () => {
    reset()
    setSubmitted(false)
    setScenario("")
    setHypothesis("")
    clearSandboxPreFill()
  }

  // 找推荐路径索引（用于高亮）
  const recommendedIndex = result?.paths?.findIndex((p) => p.isRecommended) ?? -1

  return (
    <Card
      className="h-full border-zinc-800 bg-zinc-950/60 flex flex-col"
      aria-label="决策推演沙盘面板"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-300 flex items-center justify-between">
          <span>决策推演沙盘</span>
          <div className="flex items-center gap-2">
            {sandboxPreFill && !submitted && (
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5">
                联动预填
              </span>
            )}
            <span className="text-[10px] text-zinc-600 font-mono">L1 ONLY</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto pt-0 space-y-3">
        {/* 输入表单 */}
        {!submitted || (!isRunning && !result) ? (
          <form onSubmit={handleSubmit} className="space-y-2.5" aria-label="沙盘推演输入表单">
            {/* 来源节点指示 */}
            {sandboxPreFill?.sourceNodeId && (
              <div className="text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-1">
                ← 从星云节点联动：<span className="font-mono">{sandboxPreFill.sourceNodeId}</span>
              </div>
            )}

            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5" htmlFor="sandbox-scenario">
                场景描述
              </label>
              <Input
                id="sandbox-scenario"
                className="h-8 text-xs bg-zinc-900 border-zinc-700"
                placeholder="如：欧盟对中国电动汽车加征关税"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                required
                aria-required="true"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5" htmlFor="sandbox-hypothesis">
                假设条件
              </label>
              <Input
                id="sandbox-hypothesis"
                className="h-8 text-xs bg-zinc-900 border-zinc-700"
                placeholder="如：税率从10%提升至25%，为期90天"
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                required
                aria-required="true"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5" htmlFor="sandbox-horizon">
                时间范围
              </label>
              <select
                id="sandbox-horizon"
                className="w-full h-8 text-xs bg-zinc-900 border border-zinc-700 rounded px-2 text-zinc-300"
                value={timeHorizon}
                onChange={(e) => setTimeHorizon(e.target.value)}
              >
                <option value="7d">7 天</option>
                <option value="30d">30 天</option>
                <option value="90d">90 天</option>
                <option value="180d">180 天</option>
              </select>
            </div>
            <Button
              type="submit"
              className="w-full h-8 text-xs"
              disabled={isRunning || !scenario.trim() || !hypothesis.trim()}
            >
              {isRunning ? "推演中…" : "开始推演"}
            </Button>
          </form>
        ) : null}

        {/* 推演进度 */}
        {isRunning && (
          <div
            className="flex flex-col items-center justify-center py-6 space-y-2"
            aria-label="推演进行中"
            role="status"
          >
            <div className="h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-zinc-500">推演中… 正在生成 3 条预测路径</p>
          </div>
        )}

        {/* 错误 */}
        {error && (
          <div
            className="border border-red-500/30 bg-red-500/10 rounded px-3 py-2 text-xs text-red-400"
            role="alert"
          >
            {error}
            <Button variant="outline" size="sm" className="ml-2 h-6 text-[10px]" onClick={handleReset}>
              重试
            </Button>
          </div>
        )}

        {/* 结果：带路径高亮 + 胜率 Badge */}
        {result && (
          <section aria-label="推演结果">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] text-zinc-500">
                预测路径 ({result.paths.length})
              </h4>
              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={handleReset}>
                新推演
              </Button>
            </div>
            <div className="space-y-2">
              {result.paths.map((path, i) => (
                <PathCard
                  key={path.label ?? i}
                  path={path}
                  index={i}
                  highlighted={recommendedIndex === i}
                />
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  )
}

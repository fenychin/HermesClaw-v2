/**
 * CommandTicker — 全局命令滚动条
 *
 * 底部滚动显示最近的 Agent 执行摘要与关键事件。
 * 不在此组件做任何领域判断——只展示事件摘要。
 */
"use client"

import React, { useMemo } from "react"
import { useIntelStream } from "@/hooks/use-intel-stream"
import { useIndustryIntelStore } from "@/stores/industry-intel-store"

const MAX_TICKER_ITEMS = 10

function TickerLine({ text, timestamp }: { text: string; timestamp: string }) {
  const time = new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-zinc-500 font-mono whitespace-nowrap mx-4">
      <span className="text-zinc-700">{time}</span>
      <span className="text-zinc-400">{text}</span>
      <span className="text-zinc-700">|</span>
    </span>
  )
}

export function CommandTicker() {
  const activeIndustryId = useIndustryIntelStore((s) => s.activeIndustryId)
  const { flowTicks, signals } = useIntelStream({ packId: activeIndustryId })
  const agentHeartbeats = useIndustryIntelStore((s) => s.agentHeartbeats)
  const alerts = useIndustryIntelStore((s) => s.alerts)

  // 聚合最近事件生成滚动文本
  const tickerItems = useMemo(() => {
    const items: { text: string; timestamp: string }[] = []

    // 最近告警
    for (const alert of alerts.slice(0, 3)) {
      items.push({
        text: `⚠ ${alert.payload.threatLevel ?? "?"} ${alert.payload.title ?? "告警"}`,
        timestamp: alert.timestamp,
      })
    }

    // 最近 flow tick
    if (flowTicks.length > 0) {
      const latest = flowTicks[flowTicks.length - 1]
      items.push({
        text: `Flow: ${latest.capitalFlowIndex ?? "-"}`,
        timestamp: latest.timestamp ?? new Date().toISOString(),
      })
    }

    // 最近信号
    if (signals.length > 0) {
      items.push({
        text: `信号: ${signals[0].title}`,
        timestamp: signals[0].detectedAt ?? new Date().toISOString(),
      })
    }

    // Agent 心跳摘要
    const onlineAgents = Object.values(agentHeartbeats).filter(
      (a) => a.status === "online",
    )
    if (onlineAgents.length > 0) {
      items.push({
        text: `Agent在线: ${onlineAgents.map((a) => a.agentId).join(",")}`,
        timestamp: new Date().toISOString(),
      })
    }

    return items.slice(0, MAX_TICKER_ITEMS)
  }, [flowTicks, signals, agentHeartbeats, alerts])

  if (tickerItems.length === 0) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-7 bg-zinc-950/90 backdrop-blur border-t border-zinc-800 overflow-hidden z-40"
      aria-label="全局命令滚动条"
      role="marquee"
    >
      <div className="flex items-center h-full animate-marquee">
        {/* 重复两遍以实现无缝滚动 */}
        {[...tickerItems, ...tickerItems].map((item, i) => (
          <TickerLine key={i} text={item.text} timestamp={item.timestamp} />
        ))}
      </div>
    </div>
  )
}

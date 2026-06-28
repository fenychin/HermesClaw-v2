/**
 * IntelTopBar — 情报中心顶栏
 *
 * 显示：系统状态、SSE 连接/mock 标识、五个 Agent 心跳点、GEN-N 代数、行业切换。
 * 不在此组件做任何威胁等级判定——只展示服务端结果。
 *
 * v3.43 升级：添加 MOCK DATA 红色 badge + 重连中 badge + 数据源模式检测
 */
"use client"

import React, { useEffect, useState } from "react"
import { useIndustryIntelStore } from "@/stores/industry-intel-store"
import { useAgentHeartbeat } from "@/hooks/use-agent-heartbeat"
import { useIntelSnapshot } from "@/hooks/use-intel-snapshot"
import { intelEventBus, type SSEDataMode, type IntelEventBusStatus } from "@/contexts/intel-event-bus"
import type { AgentHeartbeatState } from "@/types/industry-intel"

/** 威胁等级配色 */
const THREAT_COLORS: Record<string, string> = {
  LOW: "bg-emerald-500",
  MEDIUM: "bg-amber-500",
  HIGH: "bg-orange-500",
  CRITICAL: "bg-red-500 animate-pulse",
}

/** Agent 心跳状态配色 */
function heartbeatColor(status: AgentHeartbeatState["status"]): string {
  switch (status) {
    case "online": return "bg-emerald-500"
    case "degraded": return "bg-amber-500"
    case "offline": return "bg-zinc-600"
  }
}

function HeartbeatDot({ agent }: { agent: AgentHeartbeatState }) {
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`Agent ${agent.agentId} ${agent.label}: ${agent.status}`}
      title={`${agent.label} — ${agent.status}${agent.lastHeartbeatAt ? ` (last: ${new Date(agent.lastHeartbeatAt).toLocaleTimeString("zh-CN")})` : ""}`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${heartbeatColor(agent.status)}`}
        aria-hidden="true"
      />
      <span className="text-[11px] text-zinc-500 font-mono">{agent.agentId}</span>
    </div>
  )
}

export function IntelTopBar() {
  const globalThreatLevel = useIndustryIntelStore((s) => s.globalThreatLevel)
  const sseStatus = useIndustryIntelStore((s) => s.sseStatus)
  const activeIndustryId = useIndustryIntelStore((s) => s.activeIndustryId)
  const industryOptions = useIndustryIntelStore((s) => s.industryOptions)
  const setActiveIndustry = useIndustryIntelStore((s) => s.setActiveIndustry)
  const { onlineCount, agentList } = useAgentHeartbeat()
  const { snapshot } = useIntelSnapshot({ packId: activeIndustryId })

  // ─── SSE 连接状态 + 数据源模式（从 IntelEventBus 订阅） ─────
  const [busStatus, setBusStatus] = useState<IntelEventBusStatus>("disconnected")
  const [dataMode, setDataMode] = useState<SSEDataMode>("unknown")

  useEffect(() => {
    return intelEventBus.onStatusChange((status, mode) => {
      setBusStatus(status)
      setDataMode(mode)
    })
  }, [])

  // GEN-N 从 KPI 快照动态读取
  const genN = snapshot?.evolutionGeneration ?? 2

  // ─── 连接状态文本 ──────────────────────────────────────────────
  const statusLabel = (() => {
    switch (busStatus) {
      case "connected": return "在线"
      case "connecting": return "连接中…"
      case "reconnecting": return "重连中…"
      case "fallback-polling": return "轮询"
      case "disconnected": return "离线"
    }
  })()

  const statusColor = (() => {
    switch (busStatus) {
      case "connected": return "bg-emerald-500"
      case "connecting":
      case "reconnecting": return "bg-amber-500 animate-pulse"
      case "fallback-polling": return "bg-blue-500"
      case "disconnected": return "bg-zinc-600"
    }
  })()

  const showReconnectingBadge = busStatus === "reconnecting"
  const showMockBadge = dataMode === "mock"

  return (
    <header
      className="flex items-center justify-between px-6 py-2.5 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur"
      role="banner"
      aria-label="舆情中心顶栏"
    >
      {/* 左侧：系统状态 + 威胁等级 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${statusColor}`}
            aria-label={`SSE 连接状态: ${busStatus}`}
          />
          <span className="text-xs text-zinc-400 font-medium">
            {statusLabel}
          </span>

          {/* 重连中 badge */}
          {showReconnectingBadge && (
            <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 font-mono animate-pulse">
              重连中...
            </span>
          )}

          {/* MOCK DATA 红色 badge */}
          {showMockBadge && (
            <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5 font-mono font-bold">
              MOCK DATA
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5" aria-label={`全局威胁等级: ${globalThreatLevel}`}>
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${THREAT_COLORS[globalThreatLevel] ?? "bg-zinc-600"}`} />
          <span className="text-xs text-zinc-400 font-medium">
            威胁 {globalThreatLevel}
          </span>
        </div>

        <div className="flex items-center gap-1" aria-label={`在线 Agent: ${onlineCount}/5`}>
          <span className="text-xs text-zinc-500">AGENT</span>
          <span className="text-xs text-emerald-400 font-mono">{onlineCount}/5</span>
        </div>
      </div>

      {/* 中间：Agent 心跳点 */}
      <nav className="flex items-center gap-4" aria-label="Agent 心跳状态">
        {agentList.map((agent) => (
          <HeartbeatDot key={agent.agentId} agent={agent} />
        ))}
      </nav>

      {/* 右侧：行业切换 + GEN-N */}
      <div className="flex items-center gap-4">
        {industryOptions.length > 0 && (
          <select
            className="bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500"
            value={activeIndustryId ?? ""}
            onChange={(e) => setActiveIndustry(e.target.value)}
            aria-label="切换行业"
          >
            {industryOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        )}

        <span className="text-[11px] text-zinc-600 font-mono tracking-wider" aria-label="进化代数">
          GEN-{genN}
        </span>
      </div>
    </header>
  )
}

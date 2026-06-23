/**
 * IntelTopBar — 情报中心顶栏
 *
 * 显示：系统状态、模型置信度、五个 Agent 心跳点、GEN-N 代数、行业切换。
 * 不在此组件做任何威胁等级判定——只展示服务端结果。
 */
"use client"

import React from "react"
import { useIndustryIntelStore } from "@/stores/industry-intel-store"
import { useAgentHeartbeat } from "@/hooks/use-agent-heartbeat"
import { useIntelSnapshot } from "@/hooks/use-intel-snapshot"
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

  // GEN-N 从 KPI 快照动态读取
  const genN = snapshot?.evolutionGeneration ?? 2

  return (
    <header
      className="flex items-center justify-between px-6 py-2.5 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur"
      role="banner"
      aria-label="情报中心顶栏"
    >
      {/* 左侧：系统状态 + 威胁等级 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              sseStatus === "connected"
                ? "bg-emerald-500"
                : sseStatus === "connecting" || sseStatus === "reconnecting"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-zinc-600"
            }`}
            aria-label={`SSE 连接状态: ${sseStatus}`}
          />
          <span className="text-xs text-zinc-400 font-medium">
            {sseStatus === "connected" ? "在线" : sseStatus === "connecting" ? "连接中…" : "离线"}
          </span>
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

/**
 * useAgentHeartbeat — Agent 心跳状态管理 Hook
 *
 * 初始化 Agent 心跳状态、检测离线 Agent、提供状态摘要。
 * 不发起请求——心跳状态由 useIntelStream 通过 SSE 事件更新。
 */
"use client"

import { useEffect, useMemo } from "react"
import { useIndustryIntelStore } from "@/stores/industry-intel-store"
import type { AgentHeartbeatState } from "@/types/industry-intel"

const DEFAULT_AGENTS: AgentHeartbeatState[] = [
  { agentId: "A1", label: "态势", status: "offline", lastHeartbeatAt: null, heartbeatIntervalMs: 30_000, automationLevel: "L2" },
  { agentId: "A2", label: "数据流", status: "offline", lastHeartbeatAt: null, heartbeatIntervalMs: 3_000, automationLevel: "L1" },
  { agentId: "A3", label: "星云", status: "offline", lastHeartbeatAt: null, heartbeatIntervalMs: 300_000, automationLevel: "L2" },
  { agentId: "A4", label: "沙盘", status: "offline", lastHeartbeatAt: null, heartbeatIntervalMs: 0, automationLevel: "L1" },
  { agentId: "A5", label: "进化", status: "offline", lastHeartbeatAt: null, heartbeatIntervalMs: 3_600_000, automationLevel: "L2" },
]

interface UseAgentHeartbeatReturn {
  heartbeats: Record<string, AgentHeartbeatState>
  /** 在线 Agent 数量 */
  onlineCount: number
  /** 离线 Agent 列表（超过 3 倍心跳间隔未收到心跳） */
  offlineAgents: AgentHeartbeatState[]
  /** 所有 Agent 心跳列表（数组形式） */
  agentList: AgentHeartbeatState[]
}

export function useAgentHeartbeat(): UseAgentHeartbeatReturn {
  const heartbeats = useIndustryIntelStore((s) => s.agentHeartbeats)
  const setAgentHeartbeats = useIndustryIntelStore((s) => s.setAgentHeartbeats)
  const updateAgentHeartbeat = useIndustryIntelStore((s) => s.updateAgentHeartbeat)

  // 首次挂载时初始化默认心跳状态
  useEffect(() => {
    const initialized: Record<string, AgentHeartbeatState> = {}
    for (const agent of DEFAULT_AGENTS) {
      initialized[agent.agentId] = heartbeats[agent.agentId] ?? agent
    }
    if (Object.keys(heartbeats).length === 0) {
      setAgentHeartbeats(initialized)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 定期检测离线 Agent（10s 检查一次）
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      for (const agent of DEFAULT_AGENTS) {
        const state = useIndustryIntelStore.getState().agentHeartbeats[agent.agentId]
        if (!state || state.heartbeatIntervalMs === 0) continue // user-initiated 的 Agent 不检查离线
        const lastAt = state.lastHeartbeatAt ? new Date(state.lastHeartbeatAt).getTime() : 0
        const timeoutMs = state.heartbeatIntervalMs * 3
        if (now - lastAt > timeoutMs && state.status === "online") {
          updateAgentHeartbeat(agent.agentId, { status: "degraded" })
        }
      }
    }, 10_000)
    return () => clearInterval(interval)
  }, [updateAgentHeartbeat])

  const agentList = useMemo(
    () => DEFAULT_AGENTS.map((def) => heartbeats[def.agentId] ?? def),
    [heartbeats],
  )

  const onlineCount = useMemo(
    () => agentList.filter((a) => a.status === "online").length,
    [agentList],
  )

  const offlineAgents = useMemo(
    () => agentList.filter((a) => a.status === "offline"),
    [agentList],
  )

  return { heartbeats, onlineCount, offlineAgents, agentList }
}

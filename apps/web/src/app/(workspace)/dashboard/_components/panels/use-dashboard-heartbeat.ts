/**
 * useDashboardHeartbeat — Dashboard 轻量 SSE 心跳 Hook
 *
 * 通过模块级 intelEventBus 单例订阅 "heartbeat" 事件，
 * 不依赖 IntelStreamContext（避免拉入 8 面板渲染压力）。
 *
 * 架构决策（CLAUDE.md §14-15）：
 *   - intelEventBus 已内置 Promise 锁 → 全局唯一 SSE 连接
 *   - 每个组件独立订阅 → 不会触发其他面板重渲染
 *   - startTransition 包裹 setState → 不阻塞用户交互
 *
 * 三域归属：OpenClaw 运行时（SSE 事件流）+ Hermes（Agent 元数据）
 */
"use client"

import { useState, useEffect, useRef, useCallback, startTransition } from "react"
import { intelEventBus } from "@/contexts/intel-event-bus"
import type { IntelAgentHeartbeat } from "@/types/industry-intel"

/** 单个 Agent 展示状态 */
export interface AgentDisplayState {
  agentId: string
  label: string
  status: "online" | "degraded" | "error" | "offline"
  lastHeartbeatAt: number | null // Date.now()
  automationLevel: string
  packId: string
}

/** Agent 默认配置（从 Heartbeat Scheduler / Industry Pack manifest 派生） */
const AGENT_DEFAULTS: Omit<AgentDisplayState, "status" | "lastHeartbeatAt">[] = [
  { agentId: "A1", label: "战略态势感知", automationLevel: "L2", packId: "industry-intelligence-v2" },
  { agentId: "A2", label: "数据流量动力学", automationLevel: "L1", packId: "industry-intelligence-v2" },
  { agentId: "A3", label: "行业生态星云", automationLevel: "L2", packId: "industry-intelligence-v2" },
  { agentId: "A4", label: "沙盘推演", automationLevel: "L1", packId: "industry-intelligence-v2" },
  { agentId: "A5", label: "人机进化核心", automationLevel: "L2", packId: "industry-intelligence-v2" },
]

/** 离线检测阈值 */
const DEGRADED_THRESHOLD_MS = 30_000 // 30s 无心跳 → degraded
const OFFLINE_THRESHOLD_MS = 60_000 // 60s 无心跳 → offline
const OFFLINE_CHECK_INTERVAL_MS = 10_000 // 每 10s 检查一次

export interface UseDashboardHeartbeatReturn {
  agents: AgentDisplayState[]
  onlineCount: number
  connected: boolean
  error: string | null
  /** 手动重连 */
  reconnect: () => void
}

export function useDashboardHeartbeat(): UseDashboardHeartbeatReturn {
  const [agents, setAgents] = useState<AgentDisplayState[]>(() =>
    AGENT_DEFAULTS.map((def) => ({
      ...def,
      status: "offline" as const,
      lastHeartbeatAt: null,
    })),
  )
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ref 持有最新 agents 引用（供 offline checker interval 使用，避免 effect 依赖变化）
  const agentsRef = useRef(agents)
  agentsRef.current = agents

  // 「已收到过心跳」标记（用于延迟显示 "connecting" → "offline"）
  const hasReceivedRef = useRef(false)

  // 手动重连
  const reconnect = useCallback(() => {
    setError(null)
    setConnected(false)
    // intelEventBus.destroy() + 重新订阅会触发 ensureSSE
    // 这里仅重置状态，实际的 reconnect 由 intelEventBus 的 readLoop catch 自动处理
    hasReceivedRef.current = false
  }, [])

  useEffect(() => {
    // 订阅 heartbeat 事件（intelEventBus 内部 emit "heartbeat" 短别名）
    const unsubHeartbeat = intelEventBus.on("heartbeat", (event) => {
      const hb = event as IntelAgentHeartbeat
      if (!hb?.agentId) return

      startTransition(() => {
        hasReceivedRef.current = true
        setError(null)
        setConnected(true)
        setAgents((prev) =>
          prev.map((a) =>
            a.agentId === hb.agentId
              ? {
                  ...a,
                  status:
                    hb.status === "running" ? "online" :
                    hb.status === "degraded" ? "degraded" :
                    hb.status === "error" ? "error" :
                    "online",
                  lastHeartbeatAt: Date.now(),
                }
              : a,
          ),
        )
      })
    })

    // 也订阅完整事件名（兼容不同 emit 路径）
    const unsubFull = intelEventBus.on("intel.agent.heartbeat", (event) => {
      const hb = event as IntelAgentHeartbeat
      if (!hb?.agentId) return

      // 已经通过 "heartbeat" 别名处理了，这里做幂等兜底
      startTransition(() => {
        setConnected(true)
        setError(null)
      })
    })

    // 离线检测：10s 定期检查所有 Agent
    const interval = setInterval(() => {
      const now = Date.now()
      const current = agentsRef.current
      let anyChanged = false
      const next = current.map((a) => {
        if (a.lastHeartbeatAt === null) return a // 从未收到心跳，保持初始状态
        const elapsed = now - a.lastHeartbeatAt
        if (elapsed > OFFLINE_THRESHOLD_MS && a.status !== "offline") {
          anyChanged = true
          return { ...a, status: "offline" as const }
        }
        if (
          elapsed > DEGRADED_THRESHOLD_MS &&
          a.status === "online"
        ) {
          anyChanged = true
          return { ...a, status: "degraded" as const }
        }
        return a
      })
      if (anyChanged) {
        startTransition(() => setAgents(next))
      }
      // 如果曾经连接过但现在全离线，标记连接状态
      if (hasReceivedRef.current && next.every((a) => a.status === "offline")) {
        setConnected(false)
      }
    }, OFFLINE_CHECK_INTERVAL_MS)

    return () => {
      unsubHeartbeat()
      unsubFull()
      clearInterval(interval)
    }
  }, []) // 空依赖：effect 生命周期与组件 mount/unmount 绑定

  const onlineCount = agents.filter((a) => a.status === "online").length

  return { agents, onlineCount, connected, error, reconnect }
}

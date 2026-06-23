/**
 * useIntelStream — SSE 事件流 Hook
 *
 * 订阅 /api/v1/stream/industry-intel 的行业情报事件流。
 * 使用环形缓冲区管理瞬时数据（flow tick、signal），不写入 Zustand store。
 *
 * 关键设计：
 * - flowTicks: 环形缓冲区，最多 300 条
 * - signals: 最近 50 条信号
 * - agentHeartbeats: 最近一次心跳时间（更新 store）
 * - alerts: 新告警直接写入 store（全局关注）
 */
"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { subscribeIntelSSE } from "@/services/api/industry-intel-api"
import { useIndustryIntelStore } from "@/stores/industry-intel-store"
import type {
  IntelFlowTick,
  IntelSignalDetected,
  IntelAlertTactical,
  IntelAgentHeartbeat,
  IntelTopologyUpdated,
} from "@/types/industry-intel"

const MAX_FLOW_TICKS = 300
const MAX_SIGNALS = 50

interface UseIntelStreamOptions {
  packId: string | null
  /** 可选：topology 更新回调（Phase 4 图谱增量更新用） */
  onTopologyUpdated?: (event: IntelTopologyUpdated) => void
  /** 可选：进化提案创建回调（Phase 5 提案列表增量更新用） */
  onEvolutionProposalCreated?: (event: unknown) => void
}

interface UseIntelStreamReturn {
  connected: boolean
  flowTicks: IntelFlowTick[]
  signals: IntelSignalDetected[]
  latestAlert: IntelAlertTactical | null
  disconnect: () => void
  reconnect: () => void
}

export function useIntelStream({
  packId,
  onTopologyUpdated,
  onEvolutionProposalCreated,
}: UseIntelStreamOptions): UseIntelStreamReturn {
  const [connected, setConnected] = useState(false)

  const flowTicksRef = useRef<IntelFlowTick[]>([])
  const signalsRef = useRef<IntelSignalDetected[]>([])
  const [latestAlert, setLatestAlert] = useState<IntelAlertTactical | null>(null)
  const [flowTickVersion, setFlowTickVersion] = useState(0)
  const [signalVersion, setSignalVersion] = useState(0)

  const controllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  const setSSEStatus = useIndustryIntelStore((s) => s.setSSEStatus)
  const updateAgentHeartbeat = useIndustryIntelStore((s) => s.updateAgentHeartbeat)
  const addAlert = useIndustryIntelStore((s) => s.addAlert)
  const setGlobalThreatLevel = useIndustryIntelStore((s) => s.setGlobalThreatLevel)

  const connect = useCallback(() => {
    if (!packId) return
    controllerRef.current?.abort()

    setSSEStatus("connecting")

    const ctrl = subscribeIntelSSE(packId, {
      onConnect: () => {
        if (!mountedRef.current) return
        setConnected(true)
        setSSEStatus("connected")
      },
      onDisconnect: () => {
        if (!mountedRef.current) return
        setConnected(false)
        setSSEStatus("disconnected")
      },
      onError: () => {
        if (!mountedRef.current) return
        setConnected(false)
        setSSEStatus("reconnecting")
      },

      onFlowTick: (event) => {
        if (!mountedRef.current) return
        const tick = event as unknown as IntelFlowTick
        const buf = flowTicksRef.current
        buf.push(tick)
        if (buf.length > MAX_FLOW_TICKS) flowTicksRef.current = buf.slice(-MAX_FLOW_TICKS)
        setFlowTickVersion((v) => v + 1)
      },

      onSignalDetected: (event) => {
        if (!mountedRef.current) return
        const signal = event as unknown as IntelSignalDetected
        const buf = signalsRef.current
        buf.unshift(signal)
        if (buf.length > MAX_SIGNALS) signalsRef.current = buf.slice(0, MAX_SIGNALS)
        setSignalVersion((v) => v + 1)
      },

      onAlertTactical: (event) => {
        if (!mountedRef.current) return
        const alert = event as unknown as IntelAlertTactical
        setLatestAlert(alert)
        addAlert({
          id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          eventType: "intel.alert.tactical",
          payload: alert,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        })
        // 服务端已判定威胁等级，客户端直接同步
        setGlobalThreatLevel(alert.threatLevel)
      },

      onAgentHeartbeat: (event) => {
        if (!mountedRef.current) return
        const hb = event as unknown as IntelAgentHeartbeat
        updateAgentHeartbeat(hb.agentId, {
          status: "online",
          lastHeartbeatAt: hb.heartbeatAt ?? new Date().toISOString(),
        })
      },

      onTopologyUpdated: (event) => {
        if (!mountedRef.current) return
        onTopologyUpdated?.(event as unknown as IntelTopologyUpdated)
      },

      onEvolutionProposal: (event) => {
        if (!mountedRef.current) return
        onEvolutionProposalCreated?.(event)
      },
    })

    controllerRef.current = ctrl
  }, [packId, setSSEStatus, updateAgentHeartbeat, addAlert, setGlobalThreatLevel, onTopologyUpdated, onEvolutionProposalCreated])

  const disconnect = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setConnected(false)
    setSSEStatus("disconnected")
  }, [setSSEStatus])

  const reconnect = useCallback(() => {
    disconnect()
    setTimeout(() => {
      if (mountedRef.current) connect()
    }, 200)
  }, [disconnect, connect])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
    }
  }, [connect])

  // 用 version 触发重渲染（读取 ref 最新值）
  const flowTicks = flowTicksRef.current
  const signals = signalsRef.current
  void flowTickVersion
  void signalVersion

  return {
    connected,
    get flowTicks() { return flowTicksRef.current },
    get signals() { return signalsRef.current },
    latestAlert,
    disconnect,
    reconnect,
  }
}

/**
 * useIntelStream — SSE 事件流 Hook（兼容层）
 *
 * 订阅 /api/v1/stream/industry-intel 的行业情报事件流。
 * 使用环形缓冲区管理瞬时数据（flow tick、signal），不写入 Zustand store。
 *
 * PERF(v3.42.05):
 * - 新代码应优先使用 IntelStreamContext（页面级共享 SSE），避免重复连接
 * - 此 Hook 保留给独立页面/组件使用
 * - 使用 getState() 替代 selector hooks 避免 connect 循环重连
 * - useEffect 仅在 packId 变化时重建连接
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

  // PERF(v3.42.05): 使用 ref 持有回调，避免 effect 依赖回调引用变化导致重连
  const onTopologyUpdatedRef = useRef(onTopologyUpdated)
  const onEvolutionProposalCreatedRef = useRef(onEvolutionProposalCreated)
  useEffect(() => { onTopologyUpdatedRef.current = onTopologyUpdated }, [onTopologyUpdated])
  useEffect(() => { onEvolutionProposalCreatedRef.current = onEvolutionProposalCreated }, [onEvolutionProposalCreated])

  // PERF(v3.42.05): 所有 store 操作通过 getState()，避免 selector 变化触发 effect 重连
  const storeRef = useRef(useIndustryIntelStore)
  storeRef.current = useIndustryIntelStore

  // PERF(v3.42.05): 连接生命周期仅依赖 packId，不再因 store selector 变化重连
  useEffect(() => {
    if (!packId) return

    mountedRef.current = true
    controllerRef.current?.abort()

    const store = storeRef.current
    store.getState().setSSEStatus("connecting")

    const ctrl = subscribeIntelSSE(packId, {
      onConnect: () => {
        if (!mountedRef.current) return
        setConnected(true)
        storeRef.current.getState().setSSEStatus("connected")
      },
      onDisconnect: () => {
        if (!mountedRef.current) return
        setConnected(false)
        storeRef.current.getState().setSSEStatus("disconnected")
      },
      onError: () => {
        if (!mountedRef.current) return
        setConnected(false)
        storeRef.current.getState().setSSEStatus("reconnecting")
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
        storeRef.current.getState().addAlert({
          id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          eventType: "intel.alert.tactical",
          payload: alert,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        })
        storeRef.current.getState().setGlobalThreatLevel(alert.threatLevel)
      },

      onAgentHeartbeat: (event) => {
        if (!mountedRef.current) return
        const hb = event as unknown as IntelAgentHeartbeat
        storeRef.current.getState().updateAgentHeartbeat(hb.agentId, {
          status: "online",
          lastHeartbeatAt: hb.heartbeatAt ?? new Date().toISOString(),
        })
      },

      onTopologyUpdated: (event) => {
        if (!mountedRef.current) return
        onTopologyUpdatedRef.current?.(event as unknown as IntelTopologyUpdated)
      },

      onEvolutionProposal: (event) => {
        if (!mountedRef.current) return
        onEvolutionProposalCreatedRef.current?.(event)
      },
    })

    controllerRef.current = ctrl

    return () => {
      mountedRef.current = false
      ctrl.abort()
    }
  }, [packId]) // 仅 packId 变化时重建连接

  const disconnect = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setConnected(false)
    storeRef.current.getState().setSSEStatus("disconnected")
  }, [])

  const reconnect = useCallback(() => {
    disconnect()
    // packId 未变：直接通过重建设置相同值触发
    // 但 effect 依赖 [packId] 不会变化，所以需要手动重连
    if (!packId) return
    setTimeout(() => {
      if (!mountedRef.current) return
      controllerRef.current?.abort()
      const store = storeRef.current
      store.getState().setSSEStatus("connecting")

      const ctrl = subscribeIntelSSE(packId, {
        onConnect: () => {
          if (!mountedRef.current) return
          setConnected(true)
          store.getState().setSSEStatus("connected")
        },
        onDisconnect: () => {
          if (!mountedRef.current) return
          setConnected(false)
          store.getState().setSSEStatus("disconnected")
        },
        onError: () => {
          if (!mountedRef.current) return
          setConnected(false)
          store.getState().setSSEStatus("reconnecting")
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
          const sig = event as unknown as IntelSignalDetected
          const buf = signalsRef.current
          buf.unshift(sig)
          if (buf.length > MAX_SIGNALS) signalsRef.current = buf.slice(0, MAX_SIGNALS)
          setSignalVersion((v) => v + 1)
        },
        onAlertTactical: (event) => {
          if (!mountedRef.current) return
          const alert = event as unknown as IntelAlertTactical
          setLatestAlert(alert)
          store.getState().addAlert({
            id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            eventType: "intel.alert.tactical",
            payload: alert,
            timestamp: new Date().toISOString(),
            acknowledged: false,
          })
          store.getState().setGlobalThreatLevel(alert.threatLevel)
        },
        onAgentHeartbeat: (event) => {
          if (!mountedRef.current) return
          const hb = event as unknown as IntelAgentHeartbeat
          store.getState().updateAgentHeartbeat(hb.agentId, {
            status: "online",
            lastHeartbeatAt: hb.heartbeatAt ?? new Date().toISOString(),
          })
        },
        onTopologyUpdated: (event) => {
          if (!mountedRef.current) return
          onTopologyUpdatedRef.current?.(event as unknown as IntelTopologyUpdated)
        },
        onEvolutionProposal: (event) => {
          if (!mountedRef.current) return
          onEvolutionProposalCreatedRef.current?.(event)
        },
      })
      controllerRef.current = ctrl
    }, 200)
  }, [disconnect, packId])

  // 用 version 触发重渲染（读取 ref 最新值）
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

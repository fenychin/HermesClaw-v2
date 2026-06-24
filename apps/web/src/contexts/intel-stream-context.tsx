/**
 * IntelStreamContext — 行业情报 SSE 流共享上下文
 *
 * 【PERF v3.42.05】解决三重 SSE 连接导致的主线程阻塞问题：
 * - useIntelStream 原本被 IndustryIntelligencePage / useKnowledgeGraph / useEvolutionProposals
 *   各自独立调用，创建 3 个到 /api/v1/stream/industry-intel 的 SSE 连接
 * - A2 Agent 高频推送 flow tick 时，3 个连接各自触发 setState，造成渲染风暴
 *
 * 修复方案：
 * - 此 Context 在页面顶层管理唯一 SSE 连接
 * - useKnowledgeGraph / useEvolutionProposals 通过 Context 订阅事件
 * - 使用 ref + 订阅者模式避免 callback 闭包导致的重连
 */
"use client"

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
  startTransition,
} from "react"
import { subscribeIntelSSE } from "@/services/api/industry-intel-api"
import { useIndustryIntelStore } from "@/stores/industry-intel-store"
import type {
  IntelFlowTick,
  IntelSignalDetected,
  IntelAlertTactical,
  IntelAgentHeartbeat,
  IntelTopologyUpdated,
} from "@/types/industry-intel"

// ─── 常量 ──────────────────────────────────────────────────────────────

const MAX_FLOW_TICKS = 300
const MAX_SIGNALS = 50
// PERF: 限制 SSE 推送的渲染频率，避免每 3s 触发全 5 面板重渲染导致主线程卡死
const MIN_UPDATE_INTERVAL_MS = 15_000 // 最少间隔 15 秒触发重渲染

// ─── 类型 ──────────────────────────────────────────────────────────────

export interface IntelStreamContextValue {
  /** SSE 连接状态 */
  connected: boolean
  /** 最近 300 条数据流 tick */
  flowTicks: IntelFlowTick[]
  /** 最近 50 条信号 */
  signals: IntelSignalDetected[]
  /** 最新告警 */
  latestAlert: IntelAlertTactical | null
  /** 手动断开 */
  disconnect: () => void
  /** 手动重连 */
  reconnect: () => void
  /** 注册 topology 更新监听（返回 unsubscribe 函数） */
  subscribeTopology: (cb: (event: IntelTopologyUpdated) => void) => () => void
  /** 注册 evolution proposal 监听 */
  subscribeEvolution: (cb: (event: unknown) => void) => () => void
}

const IntelStreamContext = createContext<IntelStreamContextValue | null>(null)

// ─── Provider ──────────────────────────────────────────────────────────

export function IntelStreamProvider({
  packId,
  children,
}: {
  packId: string | null
  children: React.ReactNode
}) {
  const [connected, setConnected] = useState(false)
  const [latestAlert, setLatestAlert] = useState<IntelAlertTactical | null>(null)
  const [flowTickVersion, setFlowTickVersion] = useState(0)
  const [signalVersion, setSignalVersion] = useState(0)

  // 使用 ref 存储可变数据，避免不必要的重渲染
  const flowTicksRef = useRef<IntelFlowTick[]>([])
  const signalsRef = useRef<IntelSignalDetected[]>([])
  const controllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  // 订阅者列表（使用 ref 避免闭包问题）
  const topologySubsRef = useRef<Set<(event: IntelTopologyUpdated) => void>>(new Set())
  const evolutionSubsRef = useRef<Set<(event: unknown) => void>>(new Set())
  // PERF: 限流——记录上次触发渲染的时间，避免高频 SSE 事件导致主线程卡死
  const lastRenderTriggerRef = useRef(0)

  // Store actions（通过 getState 获取，避免放入依赖数组）
  const storeRef = useRef(useIndustryIntelStore)
  storeRef.current = useIndustryIntelStore

  // 订阅/取消订阅 API
  const subscribeTopology = useCallback((cb: (event: IntelTopologyUpdated) => void) => {
    topologySubsRef.current.add(cb)
    return () => { topologySubsRef.current.delete(cb) }
  }, [])

  const subscribeEvolution = useCallback((cb: (event: unknown) => void) => {
    evolutionSubsRef.current.add(cb)
    return () => { evolutionSubsRef.current.delete(cb) }
  }, [])

  // ─── SSE 事件处理器工厂（复用，避免 reconnect 中重复代码） ──────

  const createHandlers = useCallback(() => {
    const store = storeRef.current
    return {
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
      onFlowTick: (event: unknown) => {
        if (!mountedRef.current) return
        const tick = event as unknown as IntelFlowTick
        const buf = flowTicksRef.current
        buf.push(tick)
        if (buf.length > MAX_FLOW_TICKS) {
          flowTicksRef.current = buf.slice(-MAX_FLOW_TICKS)
        }
        // PERF: 限流——数据始终写入 ref，但渲染更新间隔至少 15s
        const now = Date.now()
        if (now - lastRenderTriggerRef.current >= MIN_UPDATE_INTERVAL_MS) {
          lastRenderTriggerRef.current = now
          startTransition(() => {
            setFlowTickVersion((v) => v + 1)
          })
        }
      },
      onSignalDetected: (event: unknown) => {
        if (!mountedRef.current) return
        const signal = event as unknown as IntelSignalDetected
        const buf = signalsRef.current
        buf.unshift(signal)
        if (buf.length > MAX_SIGNALS) {
          signalsRef.current = buf.slice(0, MAX_SIGNALS)
        }
        const now = Date.now()
        if (now - lastRenderTriggerRef.current >= MIN_UPDATE_INTERVAL_MS) {
          lastRenderTriggerRef.current = now
          startTransition(() => {
            setSignalVersion((v) => v + 1)
          })
        }
      },
      onAlertTactical: (event: unknown) => {
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
      onAgentHeartbeat: (event: unknown) => {
        if (!mountedRef.current) return
        const hb = event as unknown as IntelAgentHeartbeat
        store.getState().updateAgentHeartbeat(hb.agentId, {
          status: "online",
          lastHeartbeatAt: hb.heartbeatAt ?? new Date().toISOString(),
        })
      },
      onTopologyUpdated: (event: unknown) => {
        if (!mountedRef.current) return
        const topoEvent = event as unknown as IntelTopologyUpdated
        topologySubsRef.current.forEach((cb) => {
          try { cb(topoEvent) } catch { /* 静默 */ }
        })
      },
      onEvolutionProposal: (event: unknown) => {
        if (!mountedRef.current) return
        evolutionSubsRef.current.forEach((cb) => {
          try { cb(event) } catch { /* 静默 */ }
        })
      },
    }
  }, [])

  // 连接管理：packId 变化时重建连接
  // PERF(v3.42.05): 延迟 200ms 建立 SSE，确保页面首帧优先渲染
  useEffect(() => {
    if (!packId) return

    mountedRef.current = true
    controllerRef.current?.abort()

    storeRef.current.getState().setSSEStatus("connecting")

    const connectTimer = setTimeout(() => {
      if (!mountedRef.current) return
      const ctrl = subscribeIntelSSE(packId, createHandlers())
      controllerRef.current = ctrl
    }, 200)

    return () => {
      mountedRef.current = false
      clearTimeout(connectTimer)
      controllerRef.current?.abort()
    }
  }, [packId, createHandlers])

  // 断开/重连
  const disconnect = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setConnected(false)
    storeRef.current.getState().setSSEStatus("disconnected")
  }, [])

  const reconnect = useCallback(() => {
    disconnect()
    setTimeout(() => {
      if (!mountedRef.current || !packId) return
      controllerRef.current?.abort()
      storeRef.current.getState().setSSEStatus("connecting")
      const ctrl = subscribeIntelSSE(packId, createHandlers())
      controllerRef.current = ctrl
    }, 200)
  }, [disconnect, packId, createHandlers])

  // 用 version 强制读取 ref 最新值
  void flowTickVersion
  void signalVersion

  const value = useMemo<IntelStreamContextValue>(() => ({
    connected,
    get flowTicks() { return flowTicksRef.current },
    get signals() { return signalsRef.current },
    latestAlert,
    disconnect,
    reconnect,
    subscribeTopology,
    subscribeEvolution,
  }), [connected, latestAlert, disconnect, reconnect, subscribeTopology, subscribeEvolution, flowTickVersion, signalVersion])

  return (
    <IntelStreamContext.Provider value={value}>
      {children}
    </IntelStreamContext.Provider>
  )
}

// ─── Consumer Hook ─────────────────────────────────────────────────────

export function useIntelStreamContext(): IntelStreamContextValue {
  const ctx = useContext(IntelStreamContext)
  if (!ctx) {
    throw new Error("useIntelStreamContext must be used within <IntelStreamProvider>")
  }
  return ctx
}

/**
 * 轻量版：仅读取 SSE 连接状态和告警，不关心 flow/signal 细节。
 * 用于顶栏等只需要连接状态指示器的组件。
 */
export function useIntelStreamStatus() {
  const ctx = useContext(IntelStreamContext)
  return {
    connected: ctx?.connected ?? false,
    latestAlert: ctx?.latestAlert ?? null,
  }
}

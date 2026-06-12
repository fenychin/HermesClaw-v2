"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useUiStore } from "@/stores/ui-store";
import type { AgentExecutionState } from "@/stores/ui-store";
import { parseSSEStream } from "@/lib/sse-parser";

/** SSE 事件负载结构（与服务端 OpenClawEvent 对齐） */
interface SSERawEvent {
  type: string
  agentId: string
  payload: Record<string, unknown>
  timestamp: string
}

/** Hook 配置选项 */
export interface UseOpenClawStreamOptions {
  /** 按智能体 ID 过滤（不传则接收全部智能体事件） */
  agentId?: string
  /** 按工作流运行 ID 过滤 */
  workflowRunId?: string
  /** 自动重连间隔（毫秒），默认 3000；传 0 禁用自动重连 */
  reconnectIntervalMs?: number
  /** 连接成功回调 */
  onConnect?: () => void
  /** 连接断开回调 */
  onDisconnect?: () => void
  /** 连接错误回调（保留原始 Error 对象，含 stack trace） */
  onError?: (error: Error) => void
}

/** Hook 返回值 */
export interface UseOpenClawStreamReturn {
  /** 是否已建立连接 */
  connected: boolean
  /** 连接中 */
  connecting: boolean
  /** 最近收到的原始事件列表（最多保留 50 条） */
  recentEvents: SSERawEvent[]
  /** 手动断开连接 */
  disconnect: () => void
  /** 手动重连 */
  reconnect: () => void
}

/**
 * 将 SSE 事件类型映射为 AgentExecutionState.status
 * —— 使用 --success / --warning / --danger token 对齐的色彩语义：
 *     executing → warning（进行中）
 *     succeeded → success（成功）
 *     failed    → danger（失败）
 *     cancelled → muted-foreground（已取消）
 */
function eventTypeToStatus(type: string): AgentExecutionState['status'] {
  if (type.startsWith('task:started') || type === 'task:progress') return 'executing'
  if (type === 'task:completed') return 'succeeded'
  if (type === 'task:failed') return 'failed'
  if (type === 'task:cancelled') return 'cancelled'
  return 'idle'
}

/**
 * OpenClaw SSE 实时事件流 Hook
 * —— 订阅指定 agentId 的执行事件，自动更新 Zustand ui-store 中的 AgentExecutionState。
 *
 * 使用示例：
 *   const { connected } = useOpenClawStream({ agentId: 'agent-001' })
 *   const execState = useUiStore(s => s.agentExecutionStates['agent-001'])
 *   // execState.status → 'executing' | 'succeeded' | 'failed' | ...
 *
 * 状态指示色（遵守 CLAUDE.md 颜色系统）：
 *   executing → text-warning
 *   succeeded → text-success
 *   failed    → text-danger
 *   idle/cancelled → text-muted-foreground
 */
export function useOpenClawStream(
  options: UseOpenClawStreamOptions = {},
): UseOpenClawStreamReturn {
  const {
    agentId,
    workflowRunId,
    reconnectIntervalMs = 3000,
    onConnect,
    onDisconnect,
    onError,
  } = options

  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [recentEvents, setRecentEvents] = useState<SSERawEvent[]>([])

  const updateAgentExecutionState = useUiStore((s) => s.updateAgentExecutionState)
  const abortControllerRef = useRef<AbortController | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 用于标记组件是否已卸载，避免在卸载后 setState */
  const mountedRef = useRef(true)
  /** 存储最新 connect 引用，解决 useCallback 内自引用 lint 问题 */
  const connectRef = useRef<() => void>(() => {})

  /** 构建 SSE URL */
  const buildUrl = useCallback(() => {
    const params = new URLSearchParams()
    if (agentId) params.set('agentId', agentId)
    if (workflowRunId) params.set('workflowRunId', workflowRunId)
    const qs = params.toString()
    return `/api/openclaw/events${qs ? `?${qs}` : ''}`
  }, [agentId, workflowRunId])

  /** 核心连接逻辑 */
  const connect = useCallback(() => {
    // 避免重复连接
    if (abortControllerRef.current) return

    const controller = new AbortController()
    abortControllerRef.current = controller
    setConnecting(true)

    fetch(buildUrl(), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          throw new Error(`SSE 连接失败: ${response.status}`)
        }

        setConnected(true)
        setConnecting(false)
        onConnect?.()

        // 使用共享 SSE 解析器读取事件流
        const reader = response.body.getReader()
        await parseSSEStream(reader, {
          doneMarker: null, // OpenClaw 事件流无 [DONE] 标记，靠连接关闭自然结束
          onData: (data) => {
            const event = data as SSERawEvent
            if (event.type === 'heartbeat') return

            // 追加到最近事件列表（保留最近 50 条）
            if (mountedRef.current) {
              setRecentEvents((prev) =>
                [event, ...prev].slice(0, 50),
              )
            }

            // 更新 Zustand 中的智能体执行状态
            updateAgentExecutionState({
              agentId: event.agentId,
              status: eventTypeToStatus(event.type),
              currentTask: event.payload.taskName as string | undefined,
              progress: event.payload.progress as number | undefined,
              lastEventAt: event.timestamp,
              lastError: event.type === 'task:failed'
                ? (event.payload.error as string | undefined) ?? '未知错误'
                : undefined,
            })
          },
        })
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return
        const error = err instanceof Error ? err : new Error(String(err))
        console.warn('[useOpenClawStream] 连接错误:', error.message)
        onError?.(error)
      })
      .finally(() => {
        if (mountedRef.current) {
          setConnected(false)
          setConnecting(false)
        }
        abortControllerRef.current = null

        // 自动重连——通过 connectRef 访问最新 connect 引用
        if (mountedRef.current && reconnectIntervalMs > 0) {
          reconnectTimerRef.current = setTimeout(() => {
            if (mountedRef.current) connectRef.current()
          }, reconnectIntervalMs)
        }
      })
  }, [buildUrl, updateAgentExecutionState, reconnectIntervalMs, onConnect, onError])

  // 保持 connectRef 与最新 connect 同步（effect 中写入，禁止 render 期间直接写 ref）
  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  /** 断开连接 */
  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    if (mountedRef.current) {
      setConnected(false)
      setConnecting(false)
    }
    onDisconnect?.()
  }, [onDisconnect])

  /** 手动重连 */
  // TODO: 当前 200ms 固定延迟存在竞态窗口——disconnect 清理 abortController 后
  // connectRef 的 effect 尚未同步。生产环境可改用 state machine 管理连接生命周期。
  const reconnect = useCallback(() => {
    disconnect()
    setTimeout(() => {
      if (mountedRef.current) connectRef.current()
    }, 200)
  }, [disconnect])

  // 挂载时自动连接，卸载时清理
  useEffect(() => {
    mountedRef.current = true
    connectRef.current()

    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
    }
  }, [])

  return { connected, connecting, recentEvents, disconnect, reconnect }
}

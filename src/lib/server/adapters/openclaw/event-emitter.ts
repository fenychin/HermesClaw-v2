/**
 * OpenClaw 服务端事件发射器
 * —— 全局内存广播机制，支持 SSE 连接订阅与标准契约事件推送。
 *
 * 架构：
 *   API Route (SSE) → 注册 ReadableStream controller → 等待事件
 *   Mock / Client  → emitExecutionEvent() → 广播至匹配的 controller
 *
 * 所有事件推送均符合 ExecutionEvent 契约。
 */

import type { ExecutionEvent } from "@/contracts/execution-event"
import { EXECUTION_EVENT_VERSION } from "@/contracts/execution-event"

/** 订阅过滤器 */
export interface EventSubscriptionFilter {
  /** 按智能体 ID 过滤（从 event.payload.agentId 匹配，可选） */
  agentId?: string
  /** 按工作流运行 ID 过滤（可选） */
  workflowRunId?: string
}

/** SSE 连接包装：持有 controller 引用与过滤器，便于定向推送 */
interface SubscriberEntry {
  controller: ReadableStreamDefaultController<Uint8Array>
  filter: EventSubscriptionFilter
  connectedAt: number
}

/** 全局订阅者注册表 —— key 为连接标识，value 为 SubscriberEntry */
const subscribers = new Map<string, SubscriberEntry>()

/** 编码器实例复用 */
const encoder = new TextEncoder()

/**
 * 注册一个 SSE 订阅者。
 * @param id 连接唯一标识
 * @param controller ReadableStream controller
 * @param filter 事件过滤条件
 */
export function subscribeOpenClawEvents(
  id: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  filter: EventSubscriptionFilter = {},
): void {
  subscribers.set(id, { controller, filter, connectedAt: Date.now() })
}

/**
 * 取消注册一个 SSE 订阅者（连接关闭时调用）。
 * @param id 连接唯一标识
 */
export function unsubscribeOpenClawEvents(id: string): void {
  subscribers.delete(id)
}

/**
 * 获取当前活跃订阅者数量（用于健康检查 / 调试）。
 */
export function getOpenClawSubscriberCount(): number {
  return subscribers.size
}

/**
 * 判断事件是否匹配订阅过滤器。
 */
function matchesFilter(event: ExecutionEvent, filter: EventSubscriptionFilter): boolean {
  // agentId 过滤：若指定，校验 event.payload 中的 agentId
  if (filter.agentId && event.payload?.agentId !== filter.agentId) {
    // 兼容工作流节点广播的特殊逻辑：如果 agentId 过滤是 'workflow'，且事件为工作流事件
    if (filter.agentId === "workflow" && event.eventType.startsWith("run.")) {
      // 放行
    } else {
      return false
    }
  }
  // workflowRunId 过滤：指定则必须匹配 event.workflowRunId
  if (filter.workflowRunId && filter.workflowRunId !== event.workflowRunId) {
    return false
  }
  return true
}

/**
 * 格式化 SSE 数据帧。
 * 标准 SSE 格式：`data: <JSON>\n\n`
 */
function formatSSEFrame(event: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

/** 事件分发代理类型定义 */
export type ExecutionEventPublisher = (event: ExecutionEvent) => void | Promise<void>

/** 默认的本地进程内 SSE 广播发射代理 */
export const localSsePublisher: ExecutionEventPublisher = (event: ExecutionEvent): void => {
  const frame = formatSSEFrame(event)

  for (const [id, entry] of subscribers) {
    if (!matchesFilter(event, entry.filter)) continue

    try {
      entry.controller.enqueue(frame)
    } catch {
      subscribers.delete(id)
    }
  }
}

/** 当前激活的事件发布代理（默认使用本地 SSE 内存广播） */
let activePublisher: ExecutionEventPublisher = localSsePublisher

/**
 * 注册一个自定义事件发布代理。
 * 未来如果有分布式部署或微服务队列需求，可通过此接口注入 Redis PubSub 或 MQ 适配器，实现无缝切换。
 *
 * @param publisher 符合 ExecutionEventPublisher 契约的发布函数
 */
export function registerEventPublisher(publisher: ExecutionEventPublisher): void {
  activePublisher = publisher
}

/**
 * 发射一个标准契约执行事件。
 * @param event 标准 ExecutionEvent 对象
 */
export function emitExecutionEvent(event: ExecutionEvent): void {
  // 经由注册的活动发布代理分发执行
  try {
    const res = activePublisher(event)
    if (res instanceof Promise) {
      res.catch((err) => {
        console.error("[openclaw-event-emitter] 异步事件发射代理抛出未捕获异常:", err)
      })
    }
  } catch (err) {
    console.error("[openclaw-event-emitter] 同步事件发射代理发生异常:", err)
  }
}

/**
 * 为了保持向前兼容，保留原 emitOpenClawEvent 方法，
 * 底层将其转换为标准的 ExecutionEvent 契约对象并广播。
 *
 * @deprecated 请优先使用 emitExecutionEvent
 */
export function emitOpenClawEvent(
  agentId: string,
  event: {
    type: 'task:started' | 'task:progress' | 'task:completed' | 'task:failed' | 'task:cancelled'
         | 'connector:connected' | 'connector:disconnected' | 'connector:error'
         | 'workflow:started' | 'workflow:completed' | 'workflow:failed'
    payload: Record<string, unknown>
  },
): void {
  // 1. 映射事件状态
  let status: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled' = 'progress'
  if (event.type.endsWith(':started')) status = 'started'
  else if (event.type.endsWith(':completed')) status = 'completed'
  else if (event.type.endsWith(':failed')) status = 'failed'
  else if (event.type.endsWith(':cancelled')) status = 'cancelled'

  // 2. 映射事件族类型
  let eventType: any = 'run.progress'
  if (event.type.startsWith('task:')) {
    if (status === 'started') eventType = 'tool.call.started'
    else if (status === 'completed') eventType = 'tool.call.completed'
    else if (status === 'failed') eventType = 'tool.call.failed'
  } else if (event.type.startsWith('workflow:')) {
    if (status === 'started') eventType = 'run.started'
    else if (status === 'completed') eventType = 'run.completed'
    else if (status === 'failed') eventType = 'run.failed'
  }

  const taskId = (event.payload.taskId as string) || `t-${Date.now()}`
  const workflowRunId = (event.payload.workflowRunId as string) || (event.payload.runId as string) || `run-${Date.now()}`

  const executionEvent: ExecutionEvent = {
    eventId: `evt-${crypto.randomUUID()}`,
    taskId,
    workflowRunId,
    runtimeId: 'openclaw-runtime',
    eventType,
    status,
    timestamp: new Date().toISOString(),
    payload: {
      ...event.payload,
      agentId, // 确保 agentId 保留在 payload 中供过滤器使用
    },
    version: EXECUTION_EVENT_VERSION,
  }

  emitExecutionEvent(executionEvent)
}

/**
 * 发射工作流事件（便捷函数，保持兼容）
 */
export function emitWorkflowEvent(
  runId: string,
  type: 'workflow:started' | 'workflow:completed' | 'workflow:failed',
  payload: Record<string, unknown> = {},
): void {
  emitOpenClawEvent('workflow', {
    type,
    payload: { workflowRunId: runId, ...payload },
  })
}

/**
 * 向指定连接发送一条心跳事件（保持连接活跃）。
 * @param id 连接唯一标识
 */
export function sendHeartbeat(id: string): void {
  const entry = subscribers.get(id)
  if (!entry) return

  const heartbeat = {
    eventType: 'heartbeat' as const,
    timestamp: new Date().toISOString(),
  }

  try {
    entry.controller.enqueue(formatSSEFrame(heartbeat))
  } catch {
    subscribers.delete(id)
  }
}

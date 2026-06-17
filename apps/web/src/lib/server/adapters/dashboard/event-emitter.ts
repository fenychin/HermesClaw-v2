/**
 * Dashboard 大盘实时事件发射器
 * —— 全局内存广播机制，支持 SSE 连接订阅与结构化事件推送。
 *
 * 架构（镜像 src/lib/server/adapters/openclaw/event-emitter.ts）：
 *   API Route (SSE) → 注册 ReadableStream controller → 等待事件
 *   写入端点 → emitDashboardEvent() → 广播至匹配 controller
 *
 * 事件格式（DashboardEvent）：
 *   { type, payload, timestamp }
 *
 * 注意：本实现基于全局 Map，适用于单进程开发环境。
 * 生产环境可替换为 Redis Pub/Sub 等分布式方案。
 */

/** 大盘事件类型 */
export type DashboardEventType =
  | "dashboard:new-inquiry"      // 新询盘到达
  | "dashboard:intel-update"     // 情报更新
  | "dashboard:task-change"      // 任务状态变更
  | "dashboard:alert"            // 紧急预警
  | "dashboard:stats-refresh"    // 统计数据已刷新（泛用）

/** 大盘 SSE 事件结构 */
export interface DashboardEvent {
  /** 事件类型 */
  type: DashboardEventType
  /** 事件负载数据 */
  payload: Record<string, unknown>
  /** 时间戳（ISO 8601） */
  timestamp: string
}

/** 订阅过滤器 */
export interface DashboardEventFilter {
  /** 按工作空间 ID 过滤 */
  workspaceId?: string
}

/** SSE 连接包装 */
interface SubscriberEntry {
  controller: ReadableStreamDefaultController<Uint8Array>
  filter: DashboardEventFilter
  connectedAt: number
}

/** 全局订阅者注册表 */
const subscribers = new Map<string, SubscriberEntry>()

/** 编码器实例复用 */
const encoder = new TextEncoder()

/**
 * 注册一个 SSE 订阅者。
 */
export function subscribeDashboardEvents(
  id: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  filter: DashboardEventFilter = {},
): void {
  subscribers.set(id, { controller, filter, connectedAt: Date.now() })
}

/**
 * 取消注册一个 SSE 订阅者。
 */
export function unsubscribeDashboardEvents(id: string): void {
  subscribers.delete(id)
}

/**
 * 获取当前活跃订阅者数量。
 */
export function getDashboardSubscriberCount(): number {
  return subscribers.size
}

/**
 * 判断事件是否匹配订阅过滤器。
 */
function matchesFilter(
  event: DashboardEvent,
  filter: DashboardEventFilter,
): boolean {
  if (filter.workspaceId) {
    const eventWsId = event.payload.workspaceId as string | undefined
    if (eventWsId && eventWsId !== filter.workspaceId) return false
  }
  return true
}

/**
 * 格式化 SSE 数据帧。
 */
function formatSSEFrame(event: DashboardEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

/**
 * 发射一个大盘事件至所有匹配的订阅者。
 */
export function emitDashboardEvent(
  type: DashboardEventType,
  payload: Record<string, unknown> = {},
): void {
  const fullEvent: DashboardEvent = {
    type,
    payload,
    timestamp: new Date().toISOString(),
  }

  const frame = formatSSEFrame(fullEvent)

  for (const [id, entry] of subscribers) {
    if (!matchesFilter(fullEvent, entry.filter)) continue

    try {
      entry.controller.enqueue(frame)
    } catch {
      subscribers.delete(id)
    }
  }
}

/**
 * 向指定连接发送心跳事件。
 */
export function sendDashboardHeartbeat(id: string): void {
  const entry = subscribers.get(id)
  if (!entry) return

  const heartbeat: DashboardEvent = {
    type: "dashboard:stats-refresh",
    payload: {},
    timestamp: new Date().toISOString(),
  }

  try {
    entry.controller.enqueue(formatSSEFrame(heartbeat))
  } catch {
    subscribers.delete(id)
  }
}

/**
 * OpenClaw 服务端事件发射器
 * —— 全局内存广播机制，支持 SSE 连接订阅与结构化事件推送。
 *
 * 架构：
 *   API Route (SSE) → 注册 ReadableStream controller → 等待事件
 *   Mock / Client  → emitOpenClawEvent() → 广播至匹配的 controller
 *
 * 事件格式（OpenClawEvent）：
 *   { type, agentId, payload, timestamp }
 *
 * 注意：本实现基于全局 Map，适用于单进程开发环境。
 * 生产环境可替换为 Redis Pub/Sub 等分布式方案。
 */

/** SSE 事件结构 */
export interface OpenClawEvent {
  /** 事件类型 */
  type: 'task:started' | 'task:progress' | 'task:completed' | 'task:failed' | 'task:cancelled'
       | 'connector:connected' | 'connector:disconnected' | 'connector:error'
       | 'workflow:started' | 'workflow:completed' | 'workflow:failed'
       | 'heartbeat'
  /** 关联智能体 ID */
  agentId: string
  /** 事件负载数据 */
  payload: Record<string, unknown>
  /** 时间戳（ISO 8601） */
  timestamp: string
}

/** 订阅过滤器 */
export interface EventSubscriptionFilter {
  /** 按智能体 ID 过滤（可选） */
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
 * @param id 连接唯一标识（由调用方生成，如 crypto.randomUUID()）
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
function matchesFilter(event: OpenClawEvent, filter: EventSubscriptionFilter): boolean {
  // agentId 过滤：指定则必须匹配
  if (filter.agentId && filter.agentId !== event.agentId) return false
  // workflowRunId 过滤：指定则必须匹配 payload 中的 workflowRunId
  if (filter.workflowRunId) {
    const eventWfId = event.payload.workflowRunId as string | undefined
    if (eventWfId !== filter.workflowRunId) return false
  }
  return true
}

/**
 * 格式化 SSE 数据帧。
 * 标准 SSE 格式：`data: <JSON>\n\n`
 */
function formatSSEFrame(event: OpenClawEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

/**
 * 发射一个 OpenClaw 事件至所有匹配的订阅者。
 *
 * @param agentId 关联智能体 ID
 * @param event 事件负载（不含 agentId / timestamp，由本函数自动注入）
 *
 * 使用示例：
 *   emitOpenClawEvent('agent-001', {
 *     type: 'task:started',
 *     payload: { taskId: 't-42', taskName: '开发信写作' },
 *   })
 */
export function emitOpenClawEvent(
  agentId: string,
  event: Omit<OpenClawEvent, 'agentId' | 'timestamp'>,
): void {
  const fullEvent: OpenClawEvent = {
    ...event,
    agentId,
    timestamp: new Date().toISOString(),
  }

  const frame = formatSSEFrame(fullEvent)

  // 遍历所有订阅者，匹配即推送
  for (const [id, entry] of subscribers) {
    if (!matchesFilter(fullEvent, entry.filter)) continue

    try {
      entry.controller.enqueue(frame)
    } catch {
      // controller 已关闭或出错 → 清理该订阅者
      subscribers.delete(id)
    }
  }
}

/**
 * 向指定连接发送一条心跳事件（保持连接活跃）。
 * @param id 连接唯一标识
 */
export function sendHeartbeat(id: string): void {
  const entry = subscribers.get(id)
  if (!entry) return

  const heartbeat: OpenClawEvent = {
    type: 'heartbeat',
    agentId: '',
    payload: {},
    timestamp: new Date().toISOString(),
  }

  try {
    entry.controller.enqueue(formatSSEFrame(heartbeat))
  } catch {
    subscribers.delete(id)
  }
}

/**
 * 发射工作流事件（便捷函数）
 *
 * —— 对 emitOpenClawEvent 的语义封装，agentId 固定为 'workflow'，
 *    payload 自动注入 workflowRunId 以便 SSE 前端按 runId 过滤订阅。
 *
 * @param runId     工作流运行 ID（自动注入 payload.workflowRunId）
 * @param type      事件类型（workflow:started | workflow:completed | workflow:failed）
 * @param payload   附加负载（无需手动传 workflowRunId）
 *
 * @example
 *   emitWorkflowEvent('run-001', 'workflow:completed', {
 *     workflowId: 'wf-xxx',
 *     workflowName: '询盘分级',
 *     output: { ... },
 *   })
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

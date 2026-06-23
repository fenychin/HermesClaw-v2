/**
 * Intel SSE Stream — OpenClaw 行业情报事件流发射器
 *
 * 三域原则第二域（OpenClaw Execution Runtime）：
 * - 负责 intel.* SSE 事件的订阅/发射/补偿
 * - 维护环形缓冲区，支持断线重连时补偿最近 30 条 flow tick
 * - 禁止在此模块中做策略决策或记忆管理（Hermes 权限）
 *
 * 架构：
 *   Agent 心跳 Skill → emitIntelEvent() → 广播至匹配的 SSE 订阅者
 *   前端 EventSource → GET /stream/industry-intel → subscribeIntelStream()
 *   断线重连 → getRecentFlowTicks() → 补偿最近 30 条
 */
import type {
  IntelSSEEvent,
  IntelFlowTick,
} from "@hermesclaw/event-contracts"
import { IntelSSEEventSchema } from "@hermesclaw/event-contracts"

// ─── 订阅过滤 ─────────────────────────────────────────────────────────

export interface IntelStreamFilter {
  workspaceId?: string
  industryId?: string
}

interface SubscriberEntry {
  controller: ReadableStreamDefaultController<Uint8Array>
  filter: IntelStreamFilter
  connectedAt: number
}

const subscribers = new Map<string, SubscriberEntry>()
const encoder = new TextEncoder()

// ─── 环形缓冲区（断线补偿） ───────────────────────────────────────────

const MAX_FLOW_TICK_BUFFER = 30
const flowTickBuffer: IntelFlowTick[] = []

function pushFlowTick(tick: IntelFlowTick): void {
  flowTickBuffer.push(tick)
  if (flowTickBuffer.length > MAX_FLOW_TICK_BUFFER) {
    flowTickBuffer.shift()
  }
}

/** 获取最近 N 条 flow tick，用于断线重连补偿。 */
export function getRecentFlowTicks(limit = MAX_FLOW_TICK_BUFFER): IntelFlowTick[] {
  return flowTickBuffer.slice(-limit)
}

// ─── 订阅管理 ─────────────────────────────────────────────────────────

export function subscribeIntelStream(
  id: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  filter: IntelStreamFilter = {},
): void {
  subscribers.set(id, { controller, filter, connectedAt: Date.now() })
}

export function unsubscribeIntelStream(id: string): void {
  subscribers.delete(id)
}

export function getIntelSubscriberCount(): number {
  return subscribers.size
}

// ─── 事件格式化与广播 ─────────────────────────────────────────────────

function formatSSEFrame(eventType: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
}

function matchesIntelFilter(event: IntelSSEEvent, filter: IntelStreamFilter): boolean {
  // IntelSSEEvent 本身不携带 workspaceId/industryId 顶层字段，
  // 但部分子类型在 payload 中携带。订阅过滤基于 URL query 参数。
  // 当前实现：无过滤条件时广播所有事件；有过滤条件时保留（Phase 2 精细化）。
  if (!filter.workspaceId && !filter.industryId) return true
  // Phase 2: 按 workspace/industry 精细化过滤
  return true
}

/**
 * 发射一条 intel.* 事件到所有匹配的 SSE 订阅者。
 * 同时将 IntelFlowTick 写入环形缓冲区用于断线补偿。
 */
export function emitIntelEvent(event: IntelSSEEvent): void {
  // 强校验
  const validated = IntelSSEEventSchema.parse(event)

  // flow tick 写入补偿缓冲区
  if (validated.eventType === "intel.flow.tick") {
    pushFlowTick(validated as IntelFlowTick)
  }

  const frame = formatSSEFrame(validated.eventType, validated)

  for (const [id, entry] of subscribers) {
    if (!matchesIntelFilter(validated, entry.filter)) continue
    try {
      entry.controller.enqueue(frame)
    } catch {
      subscribers.delete(id)
    }
  }
}

/**
 * 向指定连接发送心跳。
 */
export function sendIntelHeartbeat(id: string): void {
  const entry = subscribers.get(id)
  if (!entry) return
  try {
    entry.controller.enqueue(
      encoder.encode(`:heartbeat ${new Date().toISOString()}\n\n`),
    )
  } catch {
    subscribers.delete(id)
  }
}

/**
 * 向指定连接发送补偿包（最近 N 条 flow tick）。
 * 在 SSE 连接建立后立即调用。
 */
export function sendFlowTickCompensation(
  id: string,
  limit = MAX_FLOW_TICK_BUFFER,
): void {
  const entry = subscribers.get(id)
  if (!entry) return

  const recent = getRecentFlowTicks(limit)
  for (const tick of recent) {
    try {
      entry.controller.enqueue(formatSSEFrame("intel.flow.tick", tick))
    } catch {
      subscribers.delete(id)
      return
    }
  }
}

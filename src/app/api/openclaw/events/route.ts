/**
 * OpenClaw 事件端点
 *
 *   GET  /api/openclaw/events?agentId=xxx&workflowRunId=yyy
 *        —— SSE 实时事件流（推送 ExecutionEvent）
 *   POST /api/openclaw/events
 *        —— OpenClaw runtime 回流 ExecutionEvent 的 ingest 入口（AGENTS.md §3.3）
 *
 * 连接管理：
 *   - 每 30 秒发送 heartbeat 保持连接活跃
 *   - 客户端断开或出错时自动清理订阅
 *   - 支持按 agentId / workflowRunId 过滤订阅
 *   - 接入频率限制（每次建立 SSE 连接即为一次请求）
 *
 * POST 流程：
 *   1. ExecutionEventSchema 严格校验（不合规直接 422）
 *   2. 基于 eventId 去重（重复提交返回 200 + duplicate:true）
 *   3. 落 ExecutionEventLog 表
 *   4. connector.* 事件写 AuditLog (`connector.execute`)
 *   5. 通过 emitExecutionEvent 重广播到现有 SSE 订阅
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  subscribeOpenClawEvents,
  unsubscribeOpenClawEvents,
  sendHeartbeat,
  emitExecutionEvent,
} from '@/lib/server/adapters/openclaw/event-emitter'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { ExecutionEventSchema } from '@hermesclaw/event-contracts'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/server/shared/audit'

/** SSE 心跳间隔（毫秒）—— 30 秒保活，避免代理/NAT 超时关闭连接 */
const HEARTBEAT_INTERVAL_MS = 30_000

/** 编码器实例复用（避免每次连接重复创建） */
const encoder = new TextEncoder()

/**
 * GET /api/openclaw/events
 *
 * Query 参数：
 *   agentId?       — 可选，按智能体 ID 过滤事件
 *   workflowRunId? — 可选，按工作流运行 ID 过滤事件
 */
export async function GET(req: NextRequest): Promise<Response> {
  try {
    // 频率限制：每个 IP 每分钟最多建立 5 个 SSE 连接
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    if (!rateLimit(ip, 5, 60_000)) {
      return new Response(
        JSON.stringify({ error: 'SSE 连接过于频繁，请稍后重试' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const { searchParams } = new URL(req.url)
    const agentId = searchParams.get('agentId') ?? undefined
    const workflowRunId = searchParams.get('workflowRunId') ?? undefined

    const connectionId = crypto.randomUUID()

    /** 心跳定时器引用（在 stream 作用域内读写） */
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null

    /** 创建可读流：在 start 中注册 subscriber，在 cancel 中清理 */
    const stream = new ReadableStream({
      start(controller) {
        subscribeOpenClawEvents(connectionId, controller, { agentId, workflowRunId })

        // 连接建立后立即发送一条注释帧，告知客户端连接就绪
        controller.enqueue(encoder.encode(`:ok ${connectionId}\n\n`))

        // 启动心跳定时器
        heartbeatTimer = setInterval(() => {
          sendHeartbeat(connectionId)
        }, HEARTBEAT_INTERVAL_MS)
      },

      cancel(reason) {
        // 清理心跳定时器
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer)
          heartbeatTimer = null
        }
        unsubscribeOpenClawEvents(connectionId)
        logger.info('[OpenClaw SSE] 连接关闭', {
          connectionId,
          reason: reason instanceof Error ? reason.message : String(reason ?? '客户端断开'),
        })
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // 禁用 nginx 缓冲
      },
    })
  } catch (error) {
    logger.error('[OpenClaw SSE] 连接建立失败', {
      error: error instanceof Error ? error.message : '未知错误',
    })
    return new Response(
      JSON.stringify({ error: 'SSE 连接建立失败' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

/**
 * POST /api/openclaw/events —— ExecutionEvent ingest
 *
 * 受支持事件类型对齐 packages/event-contracts EventTypeSchema（run.* / tool.* /
 * approval.* / artifact.* / session.*）。
 */
export async function POST(req: NextRequest): Promise<Response> {
  // 频率限制：单个 IP 每分钟 120 次（事件流可能高频）
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    if (!rateLimit(`openclaw-events-post:${ip}`, 120, 60_000)) {
      return NextResponse.json(
        { error: 'RATE_LIMITED', message: '事件提交过于频繁' },
        { status: 429 },
      )
    }
  } catch {
    // rateLimit 异常不阻断 ingest 主路径
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', message: '请求体必须是合法 JSON' },
      { status: 400 },
    )
  }

  const parsed = ExecutionEventSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_EXECUTION_EVENT', issues: parsed.error.issues },
      { status: 422 },
    )
  }
  const event = parsed.data

  // 基于 eventId 去重
  try {
    const existing = await prisma.executionEventLog.findUnique({
      where: { eventId: event.eventId },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { received: true, duplicate: true },
        { status: 200 },
      )
    }
  } catch (error) {
    logger.error('[POST /api/openclaw/events] eventId 去重查询失败', {
      eventId: event.eventId,
      error: error instanceof Error ? error.message : '未知错误',
    })
    // 查询失败不阻断 ingest（继续走 create，由唯一索引兜底）
  }

  // 落库
  try {
    await prisma.executionEventLog.create({
      data: {
        eventId: event.eventId,
        taskId: event.taskId,
        workflowRunId: event.workflowRunId,
        runtimeId: event.runtimeId,
        eventType: event.eventType,
        status: event.status,
        payload: JSON.stringify(event.payload ?? {}),
        connectorId: event.connectorId ?? null,
        deviceId: event.deviceId ?? null,
        receiptHash: event.receiptHash ?? null,
        parentWorkflowRunId: event.parentWorkflowRunId ?? null,
        version: event.version,
        timestamp: new Date(event.timestamp),
      },
    })
  } catch (error) {
    // 唯一索引并发冲突 → 视为重复事件
    const code = (error as { code?: string })?.code
    if (code === 'P2002') {
      return NextResponse.json(
        { received: true, duplicate: true },
        { status: 200 },
      )
    }
    logger.error('[POST /api/openclaw/events] 事件落库失败', {
      eventId: event.eventId,
      error: error instanceof Error ? error.message : '未知错误',
    })
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: '事件落库失败' },
      { status: 500 },
    )
  }

  // connector.* 事件写 AuditLog（CLAUDE.md §8.1：connector.execute 必须留痕）
  if (event.eventType.startsWith('tool.call.') && event.connectorId) {
    await writeAuditLog({
      actor: event.runtimeId,
      action: 'connector.execute',
      targetType: 'connector',
      targetId: event.connectorId,
      detail: `eventType=${event.eventType} status=${event.status} taskId=${event.taskId}`,
      riskLevel: event.status === 'failed' ? 'high' : 'low',
      // workspaceId 此处缺失（OpenClaw runtime 仅持 taskId）；
      // 临时降级使用 default workspace；生产应根据 taskId 反查
      workspaceId: 'default',
    })
  }

  // 同步广播到 SSE 订阅（让在线 UI 立刻看到）
  try {
    emitExecutionEvent(event)
  } catch (error) {
    logger.error('[POST /api/openclaw/events] SSE 重广播失败', {
      eventId: event.eventId,
      error: error instanceof Error ? error.message : '未知错误',
    })
  }

  return NextResponse.json({ received: true, duplicate: false }, { status: 200 })
}

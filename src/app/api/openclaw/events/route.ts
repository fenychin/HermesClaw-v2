/**
 * OpenClaw SSE 实时事件流端点
 * —— GET /api/openclaw/events?agentId=xxx&workflowRunId=yyy
 *
 * 返回 text/event-stream，通过 ReadableStream 推送结构化事件：
 *   data: {"type":"task:started","agentId":"agent-001","payload":{...},"timestamp":"..."}
 *
 * 连接管理：
 *   - 每 30 秒发送 heartbeat 保持连接活跃
 *   - 客户端断开或出错时自动清理订阅
 *   - 支持按 agentId / workflowRunId 过滤订阅
 *   - 接入频率限制（每次建立 SSE 连接即为一次请求）
 */
import { NextRequest } from 'next/server'
import {
  subscribeOpenClawEvents,
  unsubscribeOpenClawEvents,
  sendHeartbeat,
} from '@/lib/server/adapters/openclaw/event-emitter'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

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

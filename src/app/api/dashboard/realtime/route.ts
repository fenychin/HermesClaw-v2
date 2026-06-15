/**
 * Dashboard 大盘实时 SSE 事件流端点
 * —— GET /api/dashboard/realtime?workspaceId=xxx
 *
 * 返回 text/event-stream，通过 ReadableStream 推送结构化事件：
 *   data: {"type":"dashboard:new-inquiry","payload":{...},"timestamp":"..."}
 *
 * 连接管理：
 *   - 每 30 秒发送 heartbeat 保持连接活跃
 *   - 客户端断开或出错时自动清理订阅
 *   - 镜像 src/app/api/openclaw/events/route.ts 的流管理模式
 */
import { NextRequest } from 'next/server'
import {
  subscribeDashboardEvents,
  unsubscribeDashboardEvents,
  sendDashboardHeartbeat,
} from '@/lib/server/adapters/dashboard/event-emitter'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

/** SSE 心跳间隔（毫秒） */
const HEARTBEAT_INTERVAL_MS = 30_000

/** 编码器实例复用 */
const encoder = new TextEncoder()

/**
 * GET /api/dashboard/realtime
 *
 * Query 参数：
 *   workspaceId? — 可选，按工作空间过滤事件
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
    const workspaceId = searchParams.get('workspaceId') ?? undefined

    const connectionId = crypto.randomUUID()

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null

    const stream = new ReadableStream({
      start(controller) {
        subscribeDashboardEvents(connectionId, controller, { workspaceId })

        // 连接就绪通知
        controller.enqueue(encoder.encode(`:ok ${connectionId}\n\n`))

        // 启动心跳定时器
        heartbeatTimer = setInterval(() => {
          sendDashboardHeartbeat(connectionId)
        }, HEARTBEAT_INTERVAL_MS)
      },

      cancel(reason) {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer)
          heartbeatTimer = null
        }
        unsubscribeDashboardEvents(connectionId)
        logger.info('[Dashboard SSE] 连接关闭', {
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
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    logger.error('[Dashboard SSE] 连接建立失败', {
      error: error instanceof Error ? error.message : '未知错误',
    })
    return new Response(
      JSON.stringify({ error: 'SSE 连接建立失败' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

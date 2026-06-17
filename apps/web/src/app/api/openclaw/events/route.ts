import { NextRequest } from 'next/server'
import { subscribeEvents, unsubscribeEvents, sendHeartbeat } from '@hermesclaw/openclaw-adapter'
import { rateLimit } from '@/lib/rate-limit'; import { logger } from '@/lib/logger'

const HEARTBEAT_INTERVAL_MS = 30_000; const encoder = new TextEncoder()

export async function GET(req: NextRequest): Promise<Response> {
  const ip = req.headers.get('x-forwarded-for') || 'unknown'
  if (!rateLimit(ip, 5, 60_000)) return new Response(JSON.stringify({ error: 'SSE 连接过于频繁' }), { status: 429, headers: { 'Content-Type': 'application/json' } })
  const { searchParams } = new URL(req.url); const agentId = searchParams.get('agentId') ?? undefined; const workflowRunId = searchParams.get('workflowRunId') ?? undefined
  const connectionId = crypto.randomUUID(); let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  const stream = new ReadableStream({
    start(controller) {
      subscribeEvents(connectionId, controller, { agentId, workflowRunId }); controller.enqueue(encoder.encode(`:ok ${connectionId}\n\n`))
      heartbeatTimer = setInterval(() => sendHeartbeat(connectionId), HEARTBEAT_INTERVAL_MS)
    },
    cancel(reason) { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null } unsubscribeEvents(connectionId); logger.info('[OpenClaw SSE] 连接关闭', { connectionId }) },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } })
}

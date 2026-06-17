import { NextRequest } from 'next/server'
import { subscribeDashboardEvents, unsubscribeDashboardEvents, sendDashboardHeartbeat } from '@/lib/server/adapters/dashboard/event-emitter'
import { rateLimit } from '@/lib/rate-limit'; import { logger } from '@/lib/logger'

const HEARTBEAT_INTERVAL_MS = 30_000; const encoder = new TextEncoder()

export async function GET(req: NextRequest): Promise<Response> {
  const ip = req.headers.get('x-forwarded-for') || 'unknown'
  if (!rateLimit(ip, 5, 60_000)) return new Response(JSON.stringify({ error: 'SSE 连接过于频繁' }), { status: 429, headers: { 'Content-Type': 'application/json' } })
  const { searchParams } = new URL(req.url); const workspaceId = searchParams.get('workspaceId') ?? undefined
  const connectionId = crypto.randomUUID(); let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  const stream = new ReadableStream({
    start(controller) { subscribeDashboardEvents(connectionId, controller, { workspaceId }); controller.enqueue(encoder.encode(`:ok ${connectionId}\n\n`)); heartbeatTimer = setInterval(() => sendDashboardHeartbeat(connectionId), HEARTBEAT_INTERVAL_MS) },
    cancel(reason) { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null } unsubscribeDashboardEvents(connectionId) },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } })
}

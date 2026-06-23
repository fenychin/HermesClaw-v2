/**
 * GET /stream/industry-intel?workspaceId=&industryId=
 *
 * Intel SSE 事件流 —— OpenClaw 侧。
 * 协议：text/event-stream（标准 EventSource）
 * 断线重连：连接建立后立即补偿最近 30 条 flow tick
 * 心跳：30s 间隔
 *
 * 事件类型（见 packages/event-contracts/src/intel-sse-events.ts）：
 *   intel.flow.tick / intel.signal.detected / intel.topology.updated
 *   intel.alert.tactical / intel.evolution.proposal-created / intel.agent.heartbeat
 */
import { NextRequest } from "next/server"
import {
  subscribeIntelStream,
  unsubscribeIntelStream,
  sendIntelHeartbeat,
  sendFlowTickCompensation,
} from "@hermesclaw/openclaw-adapter"
import { logger } from "@/lib/logger"

const HEARTBEAT_INTERVAL_MS = 30_000
const encoder = new TextEncoder()

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get("workspaceId") ?? undefined
  const industryId = searchParams.get("packId") ?? searchParams.get("industryId") ?? undefined
  const connectionId = `intel-${crypto.randomUUID()}`

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      subscribeIntelStream(connectionId, controller, {
        workspaceId,
        industryId,
      })

      // 连接确认
      controller.enqueue(
        encoder.encode(`:ok ${connectionId}\n\n`),
      )

      // 补偿最近 30 条 flow tick
      sendFlowTickCompensation(connectionId, 30)

      // 心跳
      heartbeatTimer = setInterval(() => {
        sendIntelHeartbeat(connectionId)
      }, HEARTBEAT_INTERVAL_MS)
    },
    cancel() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }
      unsubscribeIntelStream(connectionId)
      logger.info("[Intel SSE] 连接关闭", { connectionId })
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

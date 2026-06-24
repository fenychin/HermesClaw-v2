/**
 * GET /api/v1/stream/industry-intel?workspaceId=&packId=
 *
 * Intel SSE 事件流 —— Web 代理层。
 *
 * PERF(v3.42.05): 优先代理到独立沙盒进程（localhost:3001），
 * 沙盒不可用时降级到内联调度器（向后兼容单进程模式）。
 *
 * 事件类型：
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
import { startHeartbeatScheduler, stopHeartbeatScheduler, isSchedulerRunning } from "@/lib/server/agent-runtime/heartbeat-scheduler"

const SANDBOX_PORT = process.env.INTEL_SANDBOX_PORT ?? "3001"
const SANDBOX_STREAM_URL = `http://localhost:${SANDBOX_PORT}/stream`
const HEARTBEAT_INTERVAL_MS = 30_000
const encoder = new TextEncoder()

/** 检查沙盒是否在线 */
async function isSandboxAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(`http://localhost:${SANDBOX_PORT}/health`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

/** 沙盒模式：代理沙盒的 SSE 流到客户端 */
function sandboxProxyStream(packId: string): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch(`${SANDBOX_STREAM_URL}?packId=${encodeURIComponent(packId)}`)
        if (!res.ok || !res.body) {
          throw new Error(`Sandbox stream 返回 ${res.status}`)
        }

        const reader = res.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(value)
        }
      } catch (err) {
        logger.error("[Intel SSE Proxy] 沙盒流代理失败", {
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        controller.close()
      }
    },
    cancel() {
      // 客户端断开，不需要额外清理（fetch 会自动释放）
    },
  })
}

/** 降级模式：内联调度器（沙盒不可用时） */
function inlineFallbackStream(
  workspaceId: string | undefined,
  industryId: string | undefined,
): ReadableStream {
  const connectionId = `intel-${crypto.randomUUID()}`
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      subscribeIntelStream(connectionId, controller, {
        workspaceId,
        industryId,
      })

      // 开发/测试阶段：启动内联 Agent 心跳调度
      if (process.env.NODE_ENV !== "production" && !isSchedulerRunning()) {
        startHeartbeatScheduler(industryId ?? "industry-intelligence-v2", true)
      }

      // 连接确认
      controller.enqueue(encoder.encode(`:ok ${connectionId}\n\n`))

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
      logger.info("[Intel SSE Fallback] 连接关闭", { connectionId })
    },
  })

  return stream
}

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get("workspaceId") ?? undefined
  const industryId = searchParams.get("packId") ?? searchParams.get("industryId") ?? undefined

  // 尝试使用沙盒
  const sandboxAvailable = await isSandboxAvailable()

  if (sandboxAvailable) {
    // PERF(v3.42.05): 沙盒可用时停止 Web 进程内的内联调度器，
    // 避免两个进程同时执行 Agent → 双倍 DB 写入竞争 → SQLite 锁阻塞主通道。
    if (isSchedulerRunning()) {
      logger.info("[Intel SSE] 检测到沙盒在线，停止内联调度器")
      stopHeartbeatScheduler()
    }

    logger.info("[Intel SSE] 使用沙盒代理模式")
    return new Response(sandboxProxyStream(industryId ?? ""), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Intel-Sandbox": "proxied",
      },
    })
  }

  // 降级：内联模式
  logger.warn("[Intel SSE] 沙盒不可用，降级到内联模式")
  return new Response(inlineFallbackStream(workspaceId, industryId), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Intel-Sandbox": "fallback",
    },
  })
}

/**
 * Intel Sandbox Server — 行业情报中心独立沙盒进程
 *
 * 设计目的（CLAUDE.md §11.8 反模式 7 → 方案 B）：
 * - Agent 心跳调度、Web Search、LLM 调用与 Next.js Web 服务分离到独立进程
 * - 消除 readFileSync / Prisma 写锁 / LLM API 调用对主进程事件循环的阻塞
 * - 沙盒崩溃不影响页面浏览和其他板块功能
 *
 * 启动方式：
 *   tsx apps/web/src/lib/server/sandbox/server.ts
 *   或 npm run dev:sandbox
 *
 * 端口：3001（可通过 INTEL_SANDBOX_PORT 环境变量覆盖）
 * 端点：
 *   GET /health  → { status: "ok", uptime, agentStatuses }
 *   GET /stream  → SSE 事件流（text/event-stream）
 */

import { createServer, IncomingMessage, ServerResponse } from "http"
import { prisma } from "../../prisma"
import { logger } from "../../logger"
import {
  startHeartbeatScheduler,
  stopHeartbeatScheduler,
  getSchedulerStatus,
} from "../agent-runtime/heartbeat-scheduler"
import {
  subscribeIntelStream,
  unsubscribeIntelStream,
  sendIntelHeartbeat,
  sendFlowTickCompensation,
  isIntelMockRunning,
} from "@hermesclaw/openclaw-adapter"

// ─── 配置 ──────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.INTEL_SANDBOX_PORT ?? "3001", 10)
const HEARTBEAT_INTERVAL_MS = 30_000
const encoder = new TextEncoder()

// ─── SSE 连接管理 ──────────────────────────────────────────────────────

interface SseConnection {
  id: string
  controller: ReadableStreamDefaultController
  timer: ReturnType<typeof setInterval> | null
}

const sseConnections = new Map<string, SseConnection>()

function addSseConnection(
  connectionId: string,
  controller: ReadableStreamDefaultController,
): void {
  // 注册到 openclaw-adapter 的事件总线
  subscribeIntelStream(connectionId, controller, {
    workspaceId: "default",
    industryId: "industry-intelligence-v2",
  })

  // 补偿最近 30 条 flow tick
  sendFlowTickCompensation(connectionId, 30)

  // 心跳保活
  const timer = setInterval(() => {
    sendIntelHeartbeat(connectionId)
  }, HEARTBEAT_INTERVAL_MS)

  sseConnections.set(connectionId, {
    id: connectionId,
    controller,
    timer,
  })
}

function removeSseConnection(connectionId: string): void {
  const conn = sseConnections.get(connectionId)
  if (conn) {
    if (conn.timer) clearInterval(conn.timer)
    unsubscribeIntelStream(connectionId)
    sseConnections.delete(connectionId)
  }
}

// ─── HTTP 路由 ─────────────────────────────────────────────────────────

function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  const agentStatuses = getSchedulerStatus()
  res.writeHead(200, { "Content-Type": "application/json" })
  res.end(
    JSON.stringify({
      status: "ok",
      uptime: process.uptime(),
      sseConnections: sseConnections.size,
      agents: agentStatuses,
      memory: process.memoryUsage(),
    }),
  )
}

function handleStream(_req: IncomingMessage, res: ServerResponse): void {
  const connectionId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const isMock = isIntelMockRunning()

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
    // v3.43: 数据源模式标识 — 前端据此显示 MOCK DATA badge
    "X-Intel-Data-Mode": isMock ? "mock" : "real",
  })

  // 连接确认
  res.write(`:ok ${connectionId}\n\n`)

  // 创建 SSE 流控制器
  const streamController: ReadableStreamDefaultController = {
    enqueue(chunk: Uint8Array) {
      try {
        res.write(Buffer.from(chunk).toString("utf-8"))
      } catch {
        removeSseConnection(connectionId)
      }
    },
    close() {
      try {
        res.end()
      } catch { /* 已关闭 */ }
    },
    error(err: unknown) {
      try {
        res.end()
      } catch { /* 已关闭 */ }
    },
    get desiredSize() {
      return 1
    },
  }

  addSseConnection(connectionId, streamController)

  // 客户端断开时清理
  _req.on("close", () => {
    removeSseConnection(connectionId)
    logger.info("[Sandbox SSE] 客户端断开", { connectionId })
  })
}

function handleNotFound(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(404, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ error: "Not found" }))
}

// ─── 服务器启动 ────────────────────────────────────────────────────────

export function startSandbox(): void {
  // 1. 验证 Prisma 连接
  prisma
    .$connect()
    .then(() => {
      logger.info("[Sandbox] Prisma 连接成功")
    })
    .catch((err: unknown) => {
      logger.error("[Sandbox] Prisma 连接失败", {
        error: err instanceof Error ? err.message : String(err),
      })
      process.exit(1)
    })

  // 2. 启动 Agent 心跳调度器（含 Mock 数据发生器，开发环境）
  const enableMock = process.env.NODE_ENV !== "production"
  startHeartbeatScheduler("industry-intelligence-v2", enableMock)
  logger.info("[Sandbox] Agent 心跳调度器已启动", {
    packId: "industry-intelligence-v2",
    enableMock,
  })

  // 3. 启动 HTTP 服务
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`)

    switch (url.pathname) {
      case "/health":
        handleHealth(req, res)
        break
      case "/stream":
        handleStream(req, res)
        break
      default:
        handleNotFound(req, res)
        break
    }
  })

  server.listen(PORT, () => {
    logger.info(`[Sandbox] 情报中心沙盒已启动`, {
      port: PORT,
      pid: process.pid,
      healthUrl: `http://localhost:${PORT}/health`,
      streamUrl: `http://localhost:${PORT}/stream`,
    })
    console.log(`\n🧠 Intel Sandbox → http://localhost:${PORT}`)
    console.log(`   Health: http://localhost:${PORT}/health`)
    console.log(`   Stream: http://localhost:${PORT}/stream\n`)
  })

  // 4. 优雅关闭
  const shutdown = () => {
    logger.info("[Sandbox] 正在关闭…")
    stopHeartbeatScheduler()
    for (const [id] of sseConnections) {
      removeSseConnection(id)
    }
    prisma.$disconnect().then(() => process.exit(0))
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

// ─── 启动 ──────────────────────────────────────────────────────────────

startSandbox()

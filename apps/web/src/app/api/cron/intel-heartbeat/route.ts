/**
 * GET /api/cron/intel-heartbeat
 *
 * 行业情报 Agent 心跳调度入口（Vercel cron 触发）。
 *
 * 流程：
 * 1. Bearer token 鉴权（CRON_SECRET）
 * 2. HeartbeatScheduler.dispatch() → 选定应触发 Agent
 * 3. AgentRunner.run() 对每个 Agent 执行 DAG
 * 4. A2（3s 间隔）在窗口内循环 10 次 tick
 * 5. 返回 { success, dispatched, results }
 *
 * Vercel cron schedule: * * * * * (每 1 分钟)
 * A2 在 handler 内以 3s 间隔循环 20 次
 */
import { NextResponse } from "next/server"
import { logger } from "@/lib/logger"
import { dispatchHeartbeat } from "@/lib/server/agent-runtime/heartbeat-scheduler"
import { runAgent } from "@/lib/server/agent-runtime/agent-runner"

const PACK_ID = "industry-intelligence-v2"
const WORKSPACE_ID = "default"

// A2 特殊处理：在 cron 窗口内以 3s 间隔循环
const A2_TICK_INTERVAL_MS = 3_000
const A2_TICK_COUNT = 20 // 60s 窗口 / 3s = 20 ticks

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function GET(request: Request): Promise<Response> {
  // Auth
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET || "dev_secret"
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 },
    )
  }

  const startTime = Date.now()

  try {
    // 1. 调度：选定应触发 Agent
    const { dispatched, skipped } = await dispatchHeartbeat(PACK_ID)

    // 2. 分离 A2（高频）和其他 Agent
    const a2Item = dispatched.find((d) => d.agentId === "A2")
    const otherAgents = dispatched.filter((d) => d.agentId !== "A2")

    // 3. 执行非 A2 Agent（并行，互不依赖）
    const results: Array<{
      agentId: string
      runId: string
      status: string
      durationMs: number
      nodeCount: number
    }> = []

    await Promise.all(
      otherAgents.map(async (item) => {
        try {
          const result = await runAgent({
            agentId: item.agentId,
            packId: PACK_ID,
            workspaceId: WORKSPACE_ID,
          })
          results.push({
            agentId: result.agentId,
            runId: result.runId,
            status: result.status,
            durationMs: result.durationMs,
            nodeCount: result.nodeCount,
          })
        } catch (err) {
          logger.error("[intel-heartbeat] Agent 执行失败", {
            agentId: item.agentId,
            error: err instanceof Error ? err.message : String(err),
          })
          results.push({
            agentId: item.agentId,
            runId: `err-${item.agentId}-${Date.now()}`,
            status: "failed",
            durationMs: 0,
            nodeCount: 0,
          })
        }
      }),
    )

    // 4. A2 高频 tick（串行循环，3s 间隔）
    if (a2Item) {
      try {
        for (let i = 0; i < A2_TICK_COUNT; i++) {
          const tickStart = Date.now()
          try {
            const result = await runAgent({
              agentId: a2Item.agentId,
              packId: PACK_ID,
              workspaceId: WORKSPACE_ID,
            })
            results.push({
              agentId: `${result.agentId}#${i + 1}`,
              runId: result.runId,
              status: result.status,
              durationMs: result.durationMs,
              nodeCount: result.nodeCount,
            })
          } catch (err) {
            logger.error("[intel-heartbeat] A2 tick 失败", {
              tick: i + 1,
              error: err instanceof Error ? err.message : String(err),
            })
          }

          // 保持 3s 间隔（扣除执行耗时）
          const elapsed = Date.now() - tickStart
          const waitMs = Math.max(0, A2_TICK_INTERVAL_MS - elapsed)
          if (waitMs > 0) {
            await sleep(waitMs)
          }
        }
      } catch (err) {
        logger.error("[intel-heartbeat] A2 循环异常", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const totalDurationMs = Date.now() - startTime

    logger.info("[intel-heartbeat] Cron 执行完成", {
      dispatchedCount: dispatched.length,
      resultsCount: results.length,
      skippedCount: skipped.length,
      totalDurationMs,
    })

    return NextResponse.json({
      success: true,
      data: {
        dispatched: dispatched.map((d) => d.agentId),
        skipped: skipped.map((s) => ({ agentId: s.agentId, reason: s.reason })),
        results,
        totalDurationMs,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error("[intel-heartbeat] Cron 执行失败", { error: message })
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTEL_HEARTBEAT_FAILED", message },
      },
      { status: 200 },
    )
  }
}

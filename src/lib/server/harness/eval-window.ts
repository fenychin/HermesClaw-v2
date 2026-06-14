/**
 * Harness 评估 — 评估窗口数据采集
 *
 * 由 P2-3 拆分自 harness-eval.ts。本文件封装：
 *   1) 拉取评估窗口内的 AgentLog
 *   2) 查询历史 errorRate 序列（趋势检测用）
 *   3) 零日志场景分类
 */

import { prisma } from "@/lib/prisma"
import { EVAL_WINDOW_HOURS, MAX_LOGS, TREND_LOOKBACK } from "./metrics"

export type Db = typeof prisma

/** 拉取评估窗口（默认 72h）内的 AgentLog（含 agent 关联） */
export async function loadEvalWindowLogs(db: Db, workspaceId: string) {
  const since = new Date(Date.now() - EVAL_WINDOW_HOURS * 60 * 60 * 1000)
  const logs = await db.agentLog.findMany({
    where: { workspaceId, createdAt: { gte: since } },
    select: {
      id: true,
      status: true,
      taskName: true,
      duration: true,
      detail: true,
      createdAt: true,
      agentId: true,
      agent: {
        select: { id: true, name: true, role: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_LOGS,
  })
  return { logs, since }
}

/** 从 DB 查询最近 N 次进化日志的 errorRate 序列。失败返回空数组。 */
export async function fetchRecentErrorRates(db: Db, workspaceId: string): Promise<number[]> {
  try {
    const recentLogs = await db.evolutionLog.findMany({
      where: { workspaceId, triggered: true },
      orderBy: { createdAt: "desc" },
      take: TREND_LOOKBACK,
      select: { errorRate: true },
    })
    return recentLogs.map((l) => l.errorRate).reverse()
  } catch (error) {
    console.warn("[fetchRecentErrorRates] 查询进化日志失败，假定无趋势", error)
    return []
  }
}

/**
 * 零日志场景分类：合并两次 DB 查询为一次并发。
 * @returns 'never-run' | 'recently-silent' | null
 */
export async function classifyZeroLogScenario(
  db: Db,
  since: Date,
  workspaceId: string,
): Promise<"never-run" | "recently-silent" | null> {
  try {
    const [lastEver, lastRecent] = await Promise.all([
      db.agentLog.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { id: true } }),
      db.agentLog.findFirst({ where: { workspaceId, createdAt: { gte: since } }, select: { id: true } }),
    ])
    if (!lastEver) return "never-run"
    if (!lastRecent) return "recently-silent"
    return null
  } catch (error) {
    console.warn("[classifyZeroLogScenario] 查询失败，无法判断零日志原因", error)
    return null
  }
}

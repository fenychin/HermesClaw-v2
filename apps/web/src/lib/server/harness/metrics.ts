/**
 * Harness 评估 — 纯函数与 metric 计算
 *
 * 由 P2-3 拆分自 harness-eval.ts。本文件不依赖 prisma / fs / 网络，
 * 可零依赖单测。任何统计函数和触发原因构造都收敛到这里。
 */

import type { HarnessMetrics } from "@/types"

/** 评估窗口（小时）—— AGENTS.md 第四章 4.6：每 72 小时自动评估一次 */
export const EVAL_WINDOW_HOURS = 72

/** 失败率触发阈值（>15% 即触发；等价于工具/任务成功率 < 85%） */
export const ERROR_RATE_THRESHOLD = 0.15

/** 最多纳入分析的日志条数 */
export const MAX_LOGS = 100

/** 进入摘要的日志条数 */
export const SUMMARY_LOGS = 20

/** 连续上升检测：回溯多少条历史进化日志 */
export const TREND_LOOKBACK = 3

/**
 * 检测 errorRate 序列是否严格连续上升。
 * 接收已排序的比率数组（最早在前），返回是否严格递增。
 */
export function isTrendingUp(rates: number[], minSamples: number = TREND_LOOKBACK): boolean {
  if (rates.length < minSamples) return false
  for (let i = 1; i < rates.length; i++) {
    if (rates[i] <= rates[i - 1]) return false
  }
  return true
}

/** 判断单条日志是否为失败状态（兼容中英文写法） */
export function isErrorStatus(status: string): boolean {
  const v = status.toLowerCase().trim()
  return (
    v === "error" ||
    v === "failed" ||
    v === "failure" ||
    v === "timeout" ||
    status.includes("失败") ||
    status.includes("超时") ||
    status.includes("异常")
  )
}

/**
 * 构造日志摘要：按 agent 分组各取失败/成功日志 + 分层采样。
 * 避免单一 agent 的日志淹没全局信号。
 */
export function buildLogSummary(
  logs: Array<{
    id: string
    status: string
    taskName: string
    duration: string | number | null
    detail: string | null
    createdAt: Date
    agentId: string | null
    agent: { id: string; name: string; role: string } | null
  }>,
): { summary: string; logSample: string[] } {
  const byAgent = new Map<string, typeof logs>()
  for (const log of logs) {
    const key = log.agent?.name ?? log.agentId ?? "unknown-agent"
    const group = byAgent.get(key) ?? []
    group.push(log)
    byAgent.set(key, group)
  }

  const selected: typeof logs = []
  for (const [, groupLogs] of byAgent) {
    const failures = groupLogs.filter((l) => isErrorStatus(l.status))
    const successes = groupLogs.filter((l) => !isErrorStatus(l.status))
    selected.push(...failures.slice(0, 3))
    selected.push(...successes.slice(0, 2))
  }

  const limited = selected.slice(0, SUMMARY_LOGS)

  const logSample = limited.map(
    (l) =>
      `[${l.status}] ${l.agent?.name ?? l.agentId} · ${l.taskName}（${l.duration ?? "?"}ms）${
        l.detail ? ` — ${l.detail.slice(0, 200)}` : ""
      }`,
  )

  const summary = logSample.join("\n") || "（最近 72 小时无任何运行日志）"
  return { summary, logSample }
}

/** 从原始日志数组统计 HarnessMetrics */
export function computeMetrics(logs: Array<{ status: string }>): HarnessMetrics {
  const total = logs.length
  const errors = logs.filter((l) => isErrorStatus(l.status)).length
  const success = total - errors
  const errorRate = total > 0 ? errors / total : 0
  const successRate = total > 0 ? success / total : 1
  return { total, errors, success, errorRate, successRate, windowHours: EVAL_WINDOW_HOURS }
}

/** 构建触发原因描述 */
export function buildTriggerReason(params: {
  thresholdExceeded: boolean
  errorRate: number
  isZeroLogs: boolean
  trendingUp: boolean
  zeroLogScenario: "never-run" | "recently-silent" | null
}): string {
  let reason = ""
  if (params.thresholdExceeded) {
    reason = `失败率 ${(params.errorRate * 100).toFixed(1)}% 超过阈值 ${ERROR_RATE_THRESHOLD * 100}%`
  }
  if (params.isZeroLogs) {
    const prefix = reason ? `${reason}；且 ` : ""
    if (params.zeroLogScenario === "never-run") {
      reason = `${prefix}评估窗口内零运行日志（系统中从未有 Agent 运行记录）`
    } else if (params.zeroLogScenario === "recently-silent") {
      reason = `${prefix}评估窗口内零运行日志（Agent 近期静默，可能存在执行中断）`
    } else {
      reason = `${prefix}评估窗口内零运行日志（无日志的执行属违规信号，AGENTS.md §5）`
    }
  }
  if (params.trendingUp) {
    const prefix = reason ? `${reason}；且 ` : ""
    reason = `${prefix}最近 ${TREND_LOOKBACK} 次评估窗 errorRate 连续上升（趋势异常）`
  }
  return reason
}

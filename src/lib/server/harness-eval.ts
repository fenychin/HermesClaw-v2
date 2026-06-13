/**
 * Harness 自演化引擎 —— 评估核心（Level 2 评估层调度）
 *
 * 负责：读取评估窗口内的智能体运行日志 → 统计指标 → 判断是否达到触发条件
 *       → 经 model-router 路由决策（写入审计留痕）→ 调用 AI 分析层产出升级提案
 *       → 组装 EvaluationReport 契约对象 → 写入 HarnessProposal + EvolutionLog。
 *
 * 被 /api/harness/evaluate（手动）与 /api/harness/cron（定时）复用，
 * 符合 CLAUDE.md「复杂业务逻辑下沉至 src/lib/server/*」的约定。
 *
 * 🔄 健康审查修复（2026-06-13）：
 *   - writeEvolutionLog 写入 logSample/reportId/analysisDurationSeconds（修复静默丢弃）
 *   - 删除私有 HarnessAnalysisResult，复用 HarnessAnalysis 类型（消除 as RiskLevel）
 *   - AI 提案内容增加 guardOutput 安全扫描
 *   - buildEvaluationReport 使用实际 workspaceId
 *   - 依赖注入：支持可选 deps 参数供测试注入
 *   - isTrendingUp 提取为纯函数
 *   - 静默 catch 块增加 console.warn
 *   - classifyZeroLogScenario 合并两次 DB 查询
 */
import { prisma } from "@/lib/prisma"
import { stringifyJsonField } from "@/lib/api-utils"
import { analyzeHarnessLogs } from "@/lib/server/harness-llm"
import type { HarnessAnalysis } from "@/lib/server/harness-llm"
import { selectModel } from "@/lib/server/model-router"
import { guardOutput } from "@/lib/server/output-guard"
import { automationLevelFromRisk } from "@/types"
import type {
  HarnessMetrics,
  HarnessEvaluateResult,
  HarnessProposal,
  RiskLevel,
  AutomationLevel,
  ProposalStatus,
  TargetComponent,
} from "@/types"
import type {
  EvaluationReport,
  EvaluationTrigger,
  AnalysisTrace,
  ProposalSummary,
} from "@/contracts"

/** 评估窗口（小时）—— AGENTS.md 第四章 4.6：每 72 小时自动评估一次 */
export const EVAL_WINDOW_HOURS = 72

/** 失败率触发阈值（>15% 即触发；等价于工具/任务成功率 < 85%） */
const ERROR_RATE_THRESHOLD = 0.15

/** 最多纳入分析的日志条数 */
const MAX_LOGS = 100

/** 进入摘要的日志条数 */
const SUMMARY_LOGS = 20

/** 连续上升检测：回溯多少条历史进化日志 */
const TREND_LOOKBACK = 3

/** 可注入依赖（供测试） */
export interface HarnessEvalDeps {
  prisma: typeof prisma
  selectModel: typeof selectModel
  analyzeHarnessLogs: typeof analyzeHarnessLogs
}

const defaultDeps: HarnessEvalDeps = {
  prisma,
  selectModel,
  analyzeHarnessLogs,
}

// ═══════════════════════════════════════════════════════════════
// 纯函数：可零依赖测试
// ═══════════════════════════════════════════════════════════════

/**
 * 检测 errorRate 序列是否严格连续上升。
 * 纯函数，接收已排序的比率数组（最早在前），返回是否严格递增。
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
 * 避免单一 agent 的日志淹没全局信号。纯函数。
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

  // 优先失败日志，每个 agent 最多取 5 条
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

/**
 * 组装符合契约的 EvaluationReport 对象。
 * 对齐 contracts/evaluation-report.ts 的 EvaluationReportSchema。纯函数。
 */
export function buildEvaluationReport(input: {
  triggeredBy: "auto" | "manual"
  workspaceId: string
  metrics: HarnessMetrics
  trigger: EvaluationTrigger
  analysis: AnalysisTrace
  proposalSummary?: ProposalSummary
  reportMd?: string
  logSample: string[]
}): EvaluationReport {
  const now = new Date().toISOString()
  return {
    reportId: `HER-${Date.now()}`,
    workspaceId: input.workspaceId,
    triggeredBy: input.triggeredBy,
    evaluatedAt: now,
    evaluationWindowHours: EVAL_WINDOW_HOURS,
    metrics: {
      total: input.metrics.total,
      errors: input.metrics.errors,
      success: input.metrics.success,
      errorRate: input.metrics.errorRate,
      successRate: input.metrics.successRate,
      windowHours: input.metrics.windowHours,
    },
    trigger: input.trigger,
    analysis: input.analysis,
    proposal: input.proposalSummary ?? null,
    reportMd: input.reportMd,
    logSample: input.logSample,
    version: "1.0.0",
  }
}

// ═══════════════════════════════════════════════════════════════
// DB 依赖函数（可注入 prisma 进行 mock）
// ═══════════════════════════════════════════════════════════════

/** 写一条进化日志。失败 console.error 不阻断主流程，但所有传入字段均实际写入。 */
async function writeEvolutionLog(
  db: typeof prisma,
  input: {
    triggeredBy: "auto" | "manual"
    triggered: boolean
    metrics: HarnessMetrics
    provider: "anthropic" | "deepseek" | null
    model: string | null
    proposalId?: string
    reason?: string
    reportMd?: string
    reportId?: string
    logSample?: string[]
    analysisDurationSeconds?: number
  },
): Promise<void> {
  try {
    await db.evolutionLog.create({
      data: {
        triggeredBy: input.triggeredBy,
        triggered: input.triggered,
        errorRate: input.metrics.errorRate,
        successRate: input.metrics.successRate,
        totalLogs: input.metrics.total,
        provider: input.provider,
        model: input.model,
        proposalId: input.proposalId ?? null,
        reason: input.reason ?? null,
        reportMd: input.reportMd ?? null,
        reportId: input.reportId ?? null,
        logSample: input.logSample ? JSON.stringify(input.logSample) : null,
        analysisDurationSeconds: input.analysisDurationSeconds ?? null,
      },
    })
  } catch (error) {
    console.error(
      "[writeEvolutionLog] 进化日志写入失败，评估历史已丢失，须排查：",
      { triggeredBy: input.triggeredBy, triggered: input.triggered, proposalId: input.proposalId },
      error,
    )
  }
}

/** 从 DB 查询最近 N 次进化日志的 errorRate 序列。失败返回空数组。 */
async function fetchRecentErrorRates(db: typeof prisma): Promise<number[]> {
  try {
    const recentLogs = await db.evolutionLog.findMany({
      where: { triggered: true },
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
async function classifyZeroLogScenario(
  db: typeof prisma,
  since: Date,
): Promise<"never-run" | "recently-silent" | null> {
  try {
    const [lastEver, lastRecent] = await Promise.all([
      db.agentLog.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } }),
      db.agentLog.findFirst({ where: { createdAt: { gte: since } }, select: { id: true } }),
    ])
    if (!lastEver) return "never-run"
    if (!lastRecent) return "recently-silent"
    return null
  } catch (error) {
    console.warn("[classifyZeroLogScenario] 查询失败，无法判断零日志原因", error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// 输出安全扫描
// ═══════════════════════════════════════════════════════════════

/** 对 AI 生成的 Harness 提案文本字段做输出安全扫描。发现敏感声明时告警。 */
function scanProposalForSensitiveClaims(draft: {
  problemStatement: string
  proposedChange: string
  reportMd: string
}): string[] {
  const warnings: string[] = []
  const checks = [
    { field: "problemStatement", text: draft.problemStatement, maxLen: 2000 },
    { field: "proposedChange", text: draft.proposedChange, maxLen: 5000 },
    { field: "reportMd", text: draft.reportMd, maxLen: 20000 },
  ]
  for (const { field, text, maxLen } of checks) {
    const result = guardOutput(text, { maxLength: maxLen })
    if (!result.ok && result.reason) {
      warnings.push(`Harness提案.${field}: ${result.reason}`)
    }
  }
  return warnings
}

// ═══════════════════════════════════════════════════════════════
// 统计与触发判断
// ═══════════════════════════════════════════════════════════════

/** 从原始日志数组统计 HarnessMetrics */
export function computeMetrics(
  logs: Array<{ status: string }>,
): HarnessMetrics {
  const total = logs.length
  const errors = logs.filter((l) => isErrorStatus(l.status)).length
  const success = total - errors
  const errorRate = total > 0 ? errors / total : 0
  const successRate = total > 0 ? success / total : 1
  return { total, errors, success, errorRate, successRate, windowHours: EVAL_WINDOW_HOURS }
}

/** 构建触发原因描述 */
function buildTriggerReason(params: {
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

// ═══════════════════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════════════════

/**
 * 执行一次 Harness 评估。
 *
 * @param triggeredBy 触发来源：auto（定时/cron）| manual（人工触发）
 * @param workspaceId 工作空间 ID（默认 "default"）
 * @param deps 可注入依赖（默认使用真实 Prisma / selectModel / analyzeHarnessLogs），供测试 mock
 */
export async function runHarnessEvaluation(
  triggeredBy: "auto" | "manual" = "auto",
  workspaceId = "default",
  deps: HarnessEvalDeps = defaultDeps,
): Promise<HarnessEvaluateResult> {
  const { prisma: db, selectModel: routeModel, analyzeHarnessLogs: analyze } = deps

  // --- 1. 读取评估窗口内的运行日志 ---
  const since = new Date(Date.now() - EVAL_WINDOW_HOURS * 60 * 60 * 1000)
  const logs = await db.agentLog.findMany({
    where: { createdAt: { gte: since } },
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

  // --- 2. 统计指标 ---
  const metrics = computeMetrics(logs)

  // --- 3. 触发条件判断 ---
  const thresholdExceeded = metrics.errorRate > ERROR_RATE_THRESHOLD
  const isZeroLogs = metrics.total === 0

  // 趋势检测（纯函数计算）
  const recentRates = await fetchRecentErrorRates(db)
  const trendingUp = isTrendingUp(recentRates)

  const shouldTrigger = thresholdExceeded || isZeroLogs || trendingUp

  // 零日志场景分类（仅 zeroLogs 时执行）
  const zeroLogScenario = isZeroLogs ? await classifyZeroLogScenario(db, since) : null

  const { logSample } = buildLogSummary(logs)

  if (!shouldTrigger) {
    // --- 未触发：写进化日志 + 返回 ---
    const reason = `指标健康（失败率 ${(metrics.errorRate * 100).toFixed(1)}% ≤ ${(
      ERROR_RATE_THRESHOLD * 100
    ).toFixed(0)}%，无连续上升趋势），未达评估触发条件`

    const trigger: EvaluationTrigger = {
      triggered: false,
      reason,
      threshold: `errorRate > ${ERROR_RATE_THRESHOLD * 100}% 或 total === 0 或连续 ${TREND_LOOKBACK} 次上升`,
    }
    const analysis: AnalysisTrace = { provider: null, model: null }

    const report = buildEvaluationReport({
      triggeredBy,
      workspaceId,
      metrics,
      trigger,
      analysis,
      logSample,
    })

    await writeEvolutionLog(db, {
      triggeredBy,
      triggered: false,
      metrics,
      provider: null,
      model: null,
      reason,
      logSample,
      reportId: report.reportId,
    })

    return {
      triggered: false,
      metrics,
      provider: null,
      model: null,
      reason,
    }
  }

  // --- 4. 构造日志摘要 + 策略路由 ---
  const { summary: logSummary } = buildLogSummary(logs)

  const routing = await routeModel({
    taskType: "analysis",
    riskLevel: metrics.errorRate > 0.3 ? "high" : "medium",
    estimatedTokens: Math.ceil(logSummary.length / 2),
    workspaceId,
  })

  // --- 5. 触发原因描述 ---
  const triggerReason = buildTriggerReason({
    thresholdExceeded,
    errorRate: metrics.errorRate,
    isZeroLogs,
    trendingUp,
    zeroLogScenario,
  })

  // --- 6. 调用 AI 分析 ---
  let analysis: HarnessAnalysis
  try {
    analysis = await analyze({
      logSummary,
      metrics,
      provider: routing.provider,
      model: routing.model,
    })
  } catch (error) {
    const reason = `AI 分析失败：${error instanceof Error ? error.message : "未知错误"}`
    console.error("[runHarnessEvaluation] AI 分析失败", error)

    await writeEvolutionLog(db, {
      triggeredBy,
      triggered: true,
      metrics,
      provider: routing.provider,
      model: routing.model,
      reason,
      logSample,
      // proposalId 不传 → null，表示"触发但分析失败，未产出提案"
    })

    return {
      triggered: true,
      metrics,
      provider: routing.provider,
      model: routing.model,
      reason,
      error: error instanceof Error ? error.message : "AI 分析失败",
    }
  }

  // --- 7. 输出安全扫描 ---
  const { draft, durationSeconds } = analysis
  const sensitiveWarnings = scanProposalForSensitiveClaims({
    problemStatement: draft.problemStatement,
    proposedChange: draft.proposedChange,
    reportMd: draft.reportMd ?? "",
  })
  if (sensitiveWarnings.length > 0) {
    console.warn("[runHarnessEvaluation] AI 提案内容输出安检告警", {
      count: sensitiveWarnings.length,
      warnings: sensitiveWarnings,
    })
  }

  // --- 8. 写入升级提案 ---
  const automationLevel: AutomationLevel = automationLevelFromRisk(draft.riskLevel)
  const created = await db.harnessProposal.create({
    data: {
      id: crypto.randomUUID(),
      proposalId: `HEP-${Date.now()}`,
      triggeredBy,
      problemStatement: draft.problemStatement,
      evidence: stringifyJsonField(draft.evidence),
      targetComponent: draft.targetComponent,
      proposedChange: draft.proposedChange,
      riskLevel: draft.riskLevel,
      automationLevel,
      status: "pending",
      estimatedImpact: draft.estimatedImpact,
    },
  })

  // --- 9. 组装 EvaluationReport ---
  const evaluationTrigger: EvaluationTrigger = {
    triggered: true,
    reason: triggerReason,
    threshold: `errorRate > ${ERROR_RATE_THRESHOLD * 100}% 或 total === 0 或连续 ${TREND_LOOKBACK} 次上升`,
  }
  const analysisTrace: AnalysisTrace = {
    provider: routing.provider,
    model: routing.model,
    durationSeconds,
  }
  const proposalSummary: ProposalSummary = {
    proposalId: created.proposalId,
    targetComponent: created.targetComponent as TargetComponent,
    proposedChange: created.proposedChange,
    riskLevel: draft.riskLevel,
    automationLevel: created.automationLevel as AutomationLevel,
    status: "pending",
  }

  const report = buildEvaluationReport({
    triggeredBy,
    workspaceId,
    metrics,
    trigger: evaluationTrigger,
    analysis: analysisTrace,
    proposalSummary,
    reportMd: draft.reportMd,
    logSample,
  })

  // --- 10. 序列化返回 ---
  const proposal: HarnessProposal = {
    id: created.id,
    proposalId: created.proposalId,
    triggeredBy: created.triggeredBy as "auto" | "manual",
    triggerReason,
    problemStatement: created.problemStatement,
    evidence: draft.evidence,
    proposedChange: {
      targetComponent: created.targetComponent as TargetComponent,
      description: created.proposedChange,
      riskLevel: draft.riskLevel,
      automationLevel: created.automationLevel as AutomationLevel,
    },
    requiresHumanApproval: true,
    estimatedImpact: created.estimatedImpact,
    affectedAgents: [],
    rollbackPlan: "回滚至升级前配置版本",
    status: created.status as ProposalStatus,
    createdAt: created.createdAt.toISOString(),
    reviewedBy: created.reviewedBy ?? undefined,
    reviewedAt: created.reviewedAt ?? undefined,
  }

  // --- 11. 进化日志（reportId/logSample/durationSeconds 实际写入）---
  await writeEvolutionLog(db, {
    triggeredBy,
    triggered: true,
    metrics,
    provider: routing.provider,
    model: routing.model,
    proposalId: created.proposalId,
    reportMd: draft.reportMd,
    logSample,
    analysisDurationSeconds: durationSeconds,
    reportId: report.reportId,
  })

  return {
    triggered: true,
    metrics,
    provider: routing.provider,
    model: routing.model,
    proposal,
    reportMd: draft.reportMd,
    evaluationReport: report,
  }
}

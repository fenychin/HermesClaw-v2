/**
 * Harness 评估 — 流程编排
 *
 * 由 P2-3 拆分自 harness-eval.ts。本文件只负责编排：
 *   loadEvalWindowLogs → computeMetrics → 触发判断 → analyzeHarnessLogs →
 *   提案落库 → buildEvaluationReport → writeEvolutionLog
 *
 * 数据采集、纯函数计算、报告组装均下沉到 eval-window.ts / metrics.ts /
 * report-builder.ts，本文件保持线性可读。
 */

import { prisma } from "@/lib/prisma"
import { analyzeHarnessLogs } from "@/lib/server/hermes/harness-llm"
import type { HarnessAnalysis } from "@/lib/server/hermes/harness-llm"
import { selectModel } from "@/lib/server/shared/model-router"
import { automationLevelFromRisk } from "@/types"
import type {
  HarnessEvaluateResult,
  HarnessProposal,
  RiskLevel,
  AutomationLevel,
  ProposalStatus,
  TargetComponent,
} from "@/types"
import type {
  EvaluationTrigger,
  AnalysisTrace,
  ProposalSummary,
} from "@/contracts"

import {
  loadEvalWindowLogs,
  fetchRecentErrorRates,
  classifyZeroLogScenario,
} from "./eval-window"
import {
  EVAL_WINDOW_HOURS,
  ERROR_RATE_THRESHOLD,
  TREND_LOOKBACK,
  isTrendingUp,
  buildLogSummary,
  computeMetrics,
  buildTriggerReason,
} from "./metrics"
import {
  buildEvaluationReport,
  writeEvolutionLog,
  scanProposalForSensitiveClaims,
} from "./report-builder"

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

/**
 * 执行一次 Harness 评估。
 *
 * @param triggeredBy 触发来源：auto（定时/cron）| manual（人工触发）
 * @param workspaceId 工作空间 ID（默认 "default"）
 * @param deps 可注入依赖（默认使用真实 Prisma / selectModel / analyzeHarnessLogs），供测试 mock
 */
export async function runHarnessEvaluation(
  workspaceId: string,
  triggeredBy: "auto" | "manual" = "auto",
  deps: HarnessEvalDeps = defaultDeps,
): Promise<HarnessEvaluateResult> {
  const { prisma: db, selectModel: routeModel, analyzeHarnessLogs: analyze } = deps

  // --- 0. 冷却限流防暴机制 (AGENTS.md §4.6 / 重构计划 P0-2) ---
  if (triggeredBy === "auto") {
    try {
      const lastEval = await db.evolutionLog.findFirst({
        where: { workspaceId },
        orderBy: { evaluatedAt: "desc" },
        select: { evaluatedAt: true },
      })
      if (lastEval) {
        const cooldownMs = 15 * 60 * 1000 // 15分钟冷却时间
        const elapsedMs = Date.now() - new Date(lastEval.evaluatedAt).getTime()
        if (elapsedMs < cooldownMs) {
          console.info(
            `[Harness Evaluation Cooldown] 触发评估被限流拦截，上一次评估在 ${(elapsedMs / 1000 / 60).toFixed(1)} 分钟前（冷却期 15 分钟），工作区 ID: ${workspaceId}`,
          )
          return {
            triggered: false,
            metrics: {
              total: 0,
              errors: 0,
              success: 0,
              errorRate: 0,
              successRate: 1,
              windowHours: EVAL_WINDOW_HOURS,
            },
            provider: null,
            model: null,
            reason: `评估处于冷却期（上一次在 ${(elapsedMs / 1000 / 60).toFixed(1)} 分钟前，冷却限流值 15 分钟），跳过评估`,
          }
        }
      }
    } catch (err) {
      console.warn("[runHarnessEvaluation] 冷却时间检查过程出现异常，略过限流进入后续评估:", err)
    }
  }

  // --- 1. 读取评估窗口内的运行日志 ---
  const { logs, since } = await loadEvalWindowLogs(db, workspaceId)

  // --- 2. 统计指标 ---
  const metrics = computeMetrics(logs)

  // --- 3. 触发条件判断 ---
  const thresholdExceeded = metrics.errorRate > ERROR_RATE_THRESHOLD
  const isZeroLogs = metrics.total === 0

  const recentRates = await fetchRecentErrorRates(db, workspaceId)
  const trendingUp = isTrendingUp(recentRates)

  const shouldTrigger = thresholdExceeded || isZeroLogs || trendingUp

  const zeroLogScenario = isZeroLogs
    ? await classifyZeroLogScenario(db, since, workspaceId)
    : null

  const { logSample } = buildLogSummary(logs)

  if (!shouldTrigger) {
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
      workspaceId,
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
      workspaceId,
      triggeredBy,
      triggered: true,
      metrics,
      provider: routing.provider,
      model: routing.model,
      reason,
      logSample,
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
      workspaceId,
      proposalId: `HEP-${Date.now()}`,
      triggeredBy,
      triggerReason,
      problemStatement: draft.problemStatement,
      evidence: draft.evidence,
      proposedChange: {
        targetComponent: draft.targetComponent,
        description: draft.proposedChange,
        riskLevel: draft.riskLevel,
        automationLevel,
      },
      requiresHumanApproval: true,
      estimatedImpact: draft.estimatedImpact,
      affectedAgents: [],
      rollbackPlan: "回滚至升级前配置版本",
      status: "pending",
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createdPropChange = created.proposedChange as any

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
    targetComponent: createdPropChange.targetComponent as TargetComponent,
    proposedChange: createdPropChange.description,
    riskLevel: createdPropChange.riskLevel as RiskLevel,
    automationLevel: createdPropChange.automationLevel as AutomationLevel,
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
    workspaceId: created.workspaceId,
    triggeredBy: created.triggeredBy as "auto" | "manual",
    triggerReason: created.triggerReason,
    problemStatement: created.problemStatement,
    evidence: created.evidence as string[],
    proposedChange: {
      targetComponent: createdPropChange.targetComponent as TargetComponent,
      description: createdPropChange.description,
      riskLevel: createdPropChange.riskLevel as RiskLevel,
      automationLevel: createdPropChange.automationLevel as AutomationLevel,
    },
    requiresHumanApproval: created.requiresHumanApproval as true,
    estimatedImpact: created.estimatedImpact,
    affectedAgents: created.affectedAgents as string[],
    rollbackPlan: created.rollbackPlan,
    status: created.status as ProposalStatus,
    createdAt: created.createdAt.toISOString(),
    reviewedBy: created.reviewedBy ?? undefined,
    reviewedAt: created.reviewedAt?.toISOString() ?? undefined,
  }

  // --- 11. 进化日志（reportId/logSample/durationSeconds 实际写入）---
  await writeEvolutionLog(db, {
    workspaceId,
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

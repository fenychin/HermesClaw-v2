/**
 * Harness 评估 — 报告组装与进化日志写入
 *
 * 由 P2-3 拆分自 harness-eval.ts。
 */

import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/server/audit"
import { guardOutput } from "@/lib/server/output-guard"
import { EVAL_WINDOW_HOURS } from "./metrics"
import type {
  HarnessMetrics,
  ModelProvider,
} from "@/types"
import type {
  EvaluationReport,
  EvaluationTrigger,
  AnalysisTrace,
  ProposalSummary,
} from "@/contracts"

export type Db = typeof prisma

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

/** 写一条进化日志。失败 console.error 不阻断主流程，但所有传入字段均实际写入。 */
export async function writeEvolutionLog(
  db: Db,
  input: {
    workspaceId: string
    triggeredBy: "auto" | "manual"
    triggered: boolean
    metrics: HarnessMetrics
    provider: ModelProvider | null
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
        workspaceId: input.workspaceId,
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
    try {
      await writeAuditLog({
        actor: "SYSTEM",
        action: "evolution.log.fail",
        targetType: "system",
        targetId: input.proposalId ?? "unknown",
        detail: `写入进化日志失败：${error instanceof Error ? error.message : "未知错误"}`,
        riskLevel: "medium",
        workspaceId: input.workspaceId,
      })
    } catch (auditErr) {
      console.error("[writeEvolutionLog] 写入进化审计日志也失败：", auditErr)
    }
  }
}

/** 对 AI 生成的 Harness 提案文本字段做输出安全扫描。发现敏感声明时告警。 */
export function scanProposalForSensitiveClaims(draft: {
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

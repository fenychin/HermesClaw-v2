/**
 * Harness 自演化引擎 —— 评估核心（Level 2 评估层调度）
 *
 * 负责：读取评估窗口内的智能体运行日志 → 统计指标 → 判断是否达到触发条件
 *       → 调用 AI 分析层产出升级提案 → 写入 HarnessProposal。
 *
 * 被 /api/harness/evaluate（手动）与 /api/harness/cron（定时）复用，
 * 符合 CLAUDE.md「复杂业务逻辑下沉至 src/lib/server/*」的约定。
 */
import { prisma } from "@/lib/prisma"
import { stringifyJsonField } from "@/lib/api-utils"
import { analyzeHarnessLogs } from "@/lib/harness-llm"
import { automationLevelFromRisk } from "@/types"
import type {
  HarnessMetrics,
  HarnessEvaluateResult,
  HarnessProposal,
  RiskLevel,
  AutomationLevel,
  ProposalStatus,
} from "@/types"

/** 评估窗口（小时）—— AGENTS.md 第四章 4.6：每 72 小时自动评估一次 */
export const EVAL_WINDOW_HOURS = 72
/** 失败率触发阈值（>15% 即触发；等价于工具/任务成功率 < 85%） */
const ERROR_RATE_THRESHOLD = 0.15
/** 最多纳入分析的日志条数 */
const MAX_LOGS = 100
/** 进入摘要的日志条数 */
const SUMMARY_LOGS = 20

/** 写一条进化日志（P1-⑤；失败静默吞错，不阻断评估主流程） */
async function writeEvolutionLog(input: {
  triggeredBy: "auto" | "manual"
  triggered: boolean
  metrics: HarnessMetrics
  provider: "anthropic" | "deepseek" | null
  model: string | null
  proposalId?: string
  reason?: string
  reportMd?: string
}): Promise<void> {
  try {
    await prisma.evolutionLog.create({
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
      },
    })
  } catch (error) {
    // 不阻断评估主流程，但进化历史丢失须醒目上报（AGENTS.md 4.6 历史存档），
    // 故升级为 error 级别；切勿降级为静默 warn。
    console.error(
      "[writeEvolutionLog] 进化日志写入失败，评估历史已丢失，须排查：",
      { triggeredBy: input.triggeredBy, triggered: input.triggered, proposalId: input.proposalId },
      error,
    )
  }
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
 * 执行一次 Harness 评估。
 * @param triggeredBy 触发来源：auto（定时/cron）| manual（人工触发）
 */
export async function runHarnessEvaluation(
  triggeredBy: "auto" | "manual" = "auto",
): Promise<HarnessEvaluateResult> {
  // 1. 读取评估窗口内的运行日志
  const since = new Date(Date.now() - EVAL_WINDOW_HOURS * 60 * 60 * 1000)
  const logs = await prisma.agentLog.findMany({
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

  // 2. 统计指标
  const total = logs.length
  const errors = logs.filter((l) => isErrorStatus(l.status)).length
  const success = total - errors
  const errorRate = total > 0 ? errors / total : 0
  const successRate = total > 0 ? success / total : 1
  const metrics: HarnessMetrics = {
    total,
    errors,
    success,
    errorRate,
    successRate,
    windowHours: EVAL_WINDOW_HOURS,
  }

  // 3. 触发判断：失败率超阈值，或窗口内零日志（无日志的执行属违规信号）
  const shouldTrigger = errorRate > ERROR_RATE_THRESHOLD || total === 0
  if (!shouldTrigger) {
    const reason = `指标健康（失败率 ${(errorRate * 100).toFixed(1)}% ≤ ${(
      ERROR_RATE_THRESHOLD * 100
    ).toFixed(0)}%），未达评估触发条件`
    // 进化日志：未触发也落一条，保证可观测性（AGENTS.md 4.6 历史存档）
    await writeEvolutionLog({
      triggeredBy,
      triggered: false,
      metrics,
      provider: null,
      model: null,
      reason,
    })
    return {
      triggered: false,
      metrics,
      provider: null,
      model: null,
      reason,
    }
  }

  // 4. 构造日志摘要交给 AI 分析
  const logSummary =
    logs
      .slice(0, SUMMARY_LOGS)
      .map(
        (l) =>
          `[${l.status}] ${l.agent?.name ?? l.agentId} · ${l.taskName}（${l.duration}）${
            l.detail ? ` — ${l.detail}` : ""
          }`,
      )
      .join("\n") || "（最近 72 小时无任何运行日志）"

  const analysis = await analyzeHarnessLogs({ logSummary, metrics })
  const { draft } = analysis

  // 5. 写入升级提案（id 无 DB 默认值，须显式生成）
  //    automationLevel 由 AI 给出的 riskLevel 派生（AGENTS.md §4.7）
  const automationLevel: AutomationLevel = automationLevelFromRisk(
    draft.riskLevel as RiskLevel,
  )
  const created = await prisma.harnessProposal.create({
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

  // 6. 序列化返回（evidence 反序列化为数组，时间转 ISO）
  const proposal: HarnessProposal = {
    id: created.id,
    proposalId: created.proposalId,
    triggeredBy: created.triggeredBy as "auto" | "manual",
    problemStatement: created.problemStatement,
    evidence: draft.evidence,
    targetComponent: created.targetComponent,
    proposedChange: created.proposedChange,
    riskLevel: created.riskLevel as RiskLevel,
    automationLevel: created.automationLevel as AutomationLevel,
    requiresApproval: true,
    status: created.status as ProposalStatus,
    estimatedImpact: created.estimatedImpact,
    createdAt: created.createdAt.toISOString(),
    reviewedBy: created.reviewedBy ?? undefined,
    reviewedAt: created.reviewedAt ?? undefined,
  }

  // 进化日志：触发并产出提案，记录报告与溯源
  await writeEvolutionLog({
    triggeredBy,
    triggered: true,
    metrics,
    provider: analysis.provider,
    model: analysis.model,
    proposalId: created.proposalId,
    reportMd: draft.reportMd,
  })

  return {
    triggered: true,
    metrics,
    provider: analysis.provider,
    model: analysis.model,
    proposal,
    reportMd: draft.reportMd,
  }
}

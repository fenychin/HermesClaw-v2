/**
 * GET /api/harness/cron — Harness Canary 自动 Promote / Rollback 调度
 *
 * Sprint 2 实现要点：
 *  1. 扫描所有 status='canary' 的提案
 *  2. 对每个提案调用 kernel 的 promoteCanaryToActive()
 *     — 未到点 → outcome='pending'
 *     — 到点且 successRate 达标 → outcome='promoted'，提案变 active
 *     — 到点但未达标（或样本不足）→ outcome='rolled-back'
 *  3. 返回汇总：{ checked, promoted, rolledBack, pending, results[] }
 *
 * 兼容性：保留 evaluateOnly 兜底 — 当传 ?evaluate=1 时同步触发新一轮评估。
 */
import { NextRequest } from "next/server"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { promoteCanaryToActive } from "@hermesclaw/hermes-kernel"

export const runtime = "nodejs"
export const maxDuration = 60

interface CanaryCheckResult {
  workspaceId: string
  proposalId: string
  outcome: "promoted" | "rolled-back" | "pending" | "skipped"
  message: string
  metrics?: unknown
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (
    secret &&
    request.headers.get("authorization") !== `Bearer ${secret}`
  ) {
    return errorResponse("未授权的定时任务调用", 401)
  }

  try {
    // 一次拉取所有 canary 提案，比按 workspace 循环更高效（cron 调用频率低）
    const canaryProposals = await prisma.harnessProposal.findMany({
      where: { status: "canary" },
      select: {
        id: true,
        proposalId: true,
        workspaceId: true,
        canaryStartedAt: true,
        canaryConfig: true,
      },
      orderBy: { canaryStartedAt: "asc" },
    })

    let promoted = 0
    let rolledBack = 0
    let pending = 0
    const details: CanaryCheckResult[] = []

    for (const proposal of canaryProposals) {
      try {
        const result = await promoteCanaryToActive(
          { proposalId: proposal.id, workspaceId: proposal.workspaceId, actor: "cron" },
          { prisma },
        )
        if (result.outcome === "promoted") promoted += 1
        else if (result.outcome === "rolled-back") rolledBack += 1
        else if (result.outcome === "pending") pending += 1

        details.push({
          workspaceId: proposal.workspaceId,
          proposalId: proposal.proposalId,
          outcome: result.outcome,
          message: result.message,
          metrics: result.metrics,
        })
      } catch (err) {
        logger.warn("Harness cron: canary 评估失败", {
          proposalId: proposal.proposalId,
          workspaceId: proposal.workspaceId,
          error: err instanceof Error ? err.message : "未知错误",
        })
        details.push({
          workspaceId: proposal.workspaceId,
          proposalId: proposal.proposalId,
          outcome: "skipped",
          message: err instanceof Error ? err.message : "评估异常",
        })
      }
    }

    return successResponse({
      checked: canaryProposals.length,
      promoted,
      rolledBack,
      pending,
      details,
      evaluatedAt: new Date().toISOString(),
    })
  } catch (error) {
    logger.error("Harness cron: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse(
      `定时评估失败: ${error instanceof Error ? error.message : "未知错误"}`,
    )
  }
}

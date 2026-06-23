/**
 * Phase 6 — 最小 Canary 发布脚本
 *
 * 使用方式（cron 或手动触发）：
 *   npx tsx scripts/canary-release.ts
 *
 * 流程：
 *   1. 扫描所有 approved 状态的 HarnessProposal
 *   2. 为符合条件的 proposal 创建 snapshot
 *   3. 启动 canary（trafficPercent 默认 10%，观察窗口 24h）
 *   4. 评估运行中的 canary 健康状况
 *   5. 健康 → promote；恶化 → rollback
 *
 * 安全约束：
 *   - 不可直接激活 draft/pending proposal
 *   - 每个 proposal 只能有一个活跃 canary
 *   - 回滚必须基于 snapshot/version
 */
import { prisma } from "@/lib/prisma"
import { captureSnapshot } from "@/lib/server/harness-snapshot"
import { startCanary, evaluateCanaryHealth, promoteCanary } from "@/lib/server/canary"
import { executeRollback } from "@/lib/server/rollback"
import { createAuditEntry, updateAuditEntry } from "@/lib/server/audit"
import { logger } from "@/lib/logger"

const TRAFFIC_PERCENT = parseInt(process.env.CANARY_TRAFFIC_PERCENT || "10", 10)
const OBSERVATION_WINDOW_MS = parseInt(
  process.env.CANARY_OBSERVATION_WINDOW_MS || String(24 * 60 * 60 * 1000),
  10
)
const DRY_RUN = process.env.CANARY_DRY_RUN === "1"

async function main() {
  logger.info("[canary-release] 开始 Canary 发布巡检", {
    service: "canary-release",
    action: "canary.release.start",
    dryRun: DRY_RUN,
  })

  // ── Phase 1: 启动新 Canary ──────────────────────────────────────────
  const approvedProposals = await prisma.harnessProposal.findMany({
    where: { status: "approved" },
    include: { canary: true },
  })

  const eligibleProposals = approvedProposals.filter((p) => !p.canary)

  logger.info(
    `[canary-release] 发现 ${approvedProposals.length} 条已批准提案，` +
      `${eligibleProposals.length} 条可启动 canary`
  )

  for (const proposal of eligibleProposals) {
    const agentId = (proposal.proposedChange as any)?.agentId ?? "default-agent"

    try {
      // 创建 snapshot
      const snapshot = await captureSnapshot({
        workspaceId: proposal.workspaceId,
        agentId,
        proposalId: proposal.id,
        snapshotType: "pre-canary",
        createdBy: "canary-release",
        policySnapshotVersion: `canary-${Date.now()}`,
      })

      if (DRY_RUN) {
        logger.info(`[canary-release] [DRY RUN] 将为 ${proposal.proposalId} 启动 canary`, {
          service: "canary-release",
          action: "canary.release.dry-run",
          proposalId: proposal.proposalId,
          snapshotId: snapshot.snapshotId,
        })
        continue
      }

      // 审计预记录
      const auditEntry = await createAuditEntry({
        actor: "canary-release",
        action: "canary.started",
        targetType: "canary",
        targetId: proposal.proposalId,
        detail: `自动化 Canary 启动: ${proposal.proposalId}`,
        riskLevel: "medium",
        workspaceId: proposal.workspaceId,
        automationLevel: "L2",
        triggeredBy: "cron",
        contextSnapshot: {
          proposalId: proposal.proposalId,
          trafficPercent: TRAFFIC_PERCENT,
          observationWindowMs: OBSERVATION_WINDOW_MS,
        },
      })

      // 启动 canary
      const canary = await startCanary({
        proposalId: proposal.id,
        workspaceId: proposal.workspaceId,
        agentId,
        snapshotId: snapshot.snapshotId,
        trafficPercent: TRAFFIC_PERCENT,
        observationWindowMs: OBSERVATION_WINDOW_MS,
        startedBy: "canary-release",
      })

      await updateAuditEntry({ auditId: auditEntry.auditId, status: "success" })

      logger.info(
        `[canary-release] Canary 已启动: ${canary.canaryId} (proposal: ${proposal.proposalId}, traffic: ${TRAFFIC_PERCENT}%)`,
        {
          service: "canary-release",
          action: "canary.started",
          canaryId: canary.canaryId,
          proposalId: proposal.proposalId,
        }
      )
    } catch (err) {
      logger.error(
        `[canary-release] Canary 启动失败: ${proposal.proposalId}`,
        {
          service: "canary-release",
          action: "canary.start.failed",
          errorMessage: err instanceof Error ? err.message : String(err),
        }
      )
    }
  }

  // ── Phase 2: 评估运行中 Canary ──────────────────────────────────────
  if (DRY_RUN) {
    logger.info("[canary-release] [DRY RUN] 跳过健康评估")
    return
  }

  const result = await evaluateCanaryHealth(undefined, {
    writeAuditLog: async (input) => {
      await createAuditEntry({
        actor: input.actor,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        detail: input.detail,
        riskLevel: input.riskLevel,
        workspaceId: input.workspaceId,
        automationLevel: "L2",
        triggeredBy: "cron",
      })
    },
    getLatestMetrics: async (workspaceId, agentId) => {
      // 从 WorkflowRun + AgentLog + Receipt 聚合实时指标
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

      const [totalRuns, failedRuns] = await Promise.all([
        prisma.workflowRun.count({
          where: {
            workspaceId,
            agentId,
            createdAt: { gte: since },
            status: { in: ["completed", "failed"] },
          },
        }),
        prisma.workflowRun.count({
          where: {
            workspaceId,
            agentId,
            createdAt: { gte: since },
            status: "failed",
          },
        }),
      ])

      const [totalReceipts, failedReceipts] = await Promise.all([
        prisma.actionReceipt.count({
          where: { workspaceId, executedAt: { gte: since } },
        }),
        prisma.actionReceipt.count({
          where: {
            workspaceId,
            executedAt: { gte: since },
            outcome: "failure",
          },
        }),
      ])

      const successRate = totalRuns > 0 ? (totalRuns - failedRuns) / totalRuns : 1
      const errorRate = totalRuns > 0 ? failedRuns / totalRuns : 0
      const connectorSuccessRate =
        totalReceipts > 0 ? (totalReceipts - failedReceipts) / totalReceipts : 1

      return {
        errorRate,
        successRate,
        avgLatencyMs: 0, // 简化实现
        humanCorrectionRate: 0,
        connectorSuccessRate,
      }
    },
    triggerRollback: async (canaryId, reason) => {
      const canary = await prisma.harnessCanary.findUnique({ where: { canaryId } })
      if (!canary) return

      await executeRollback(
        {
          canaryId,
          workspaceId: canary.workspaceId,
          reason,
          triggerType: "auto",
          triggeredBy: "canary-release",
        },
        {
          writeAuditLog: async (input) => {
            await createAuditEntry({
              actor: input.actor,
              action: input.action,
              targetType: input.targetType,
              targetId: input.targetId,
              detail: input.detail,
              riskLevel: input.riskLevel,
              workspaceId: input.workspaceId,
              automationLevel: "L2",
              triggeredBy: "cron",
            })
          },
        }
      )
    },
  })

  logger.info("[canary-release] 评估完成", {
    service: "canary-release",
    action: "canary.release.complete",
    ...result,
  })
}

main()
  .then(() => {
    logger.info("[canary-release] 脚本完成")
    process.exit(0)
  })
  .catch((err) => {
    logger.error("[canary-release] 脚本失败", {
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
    })
    process.exit(1)
  })

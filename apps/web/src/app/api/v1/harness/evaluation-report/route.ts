/**
 * GET /api/v1/harness/evaluation-report — 最新 Harness 评估报告
 *
 * 返回最近一次评估的 EvaluationReport，包含：
 * - 指标快照（HarnessMetrics）
 * - 触发条件判断
 * - AI 分析溯源
 * - 提案摘要
 *
 * 三域调用点：[控制域] — 通过 Hermes kernel 适配层读取评估状态。
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { ApiResponse } from "@/lib/server/api-response"
import { buildWorkspaceContext } from "@/lib/workspace"
import { EvaluationReportSchema } from "@hermesclaw/event-contracts"

export const runtime = "nodejs"
export const revalidate = 60

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)

    // 查最新一条 HarnessProposal（作为评估报告的代表）
    const latestProposal = await prisma.harnessProposal.findFirst({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
    })

    // 聚合 HarnessProposal 统计
    const [totalCount, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      prisma.harnessProposal.count({ where: { workspaceId: ctx.workspaceId } }),
      prisma.harnessProposal.count({ where: { workspaceId: ctx.workspaceId, status: { in: ["draft", "pending"] } } }),
      prisma.harnessProposal.count({ where: { workspaceId: ctx.workspaceId, status: "approved" } }),
      prisma.harnessProposal.count({ where: { workspaceId: ctx.workspaceId, status: "rejected" } }),
    ])

    // 查最近审批（用于签名区）
    const latestApproval = await prisma.auditLog.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        action: { in: ["approve.proposal", "reject.proposal"] },
      },
      orderBy: { createdAt: "desc" },
    })

    const report = EvaluationReportSchema.parse({
      reportId: latestProposal?.id ?? `eval-${ctx.workspaceId}`,
      workspaceId: ctx.workspaceId,
      triggeredBy: latestProposal?.triggeredBy === "cron.evaluation" ? "auto" : "manual",
      evaluatedAt: latestProposal?.createdAt?.toISOString() ?? new Date().toISOString(),
      evaluationWindowHours: 72,
      metrics: {
        total: totalCount,
        errors: rejectedCount,
        success: approvedCount,
        errorRate: totalCount > 0 ? rejectedCount / totalCount : 0,
        successRate: totalCount > 0 ? approvedCount / totalCount : 0,
        windowHours: 72,
      },
      trigger: {
        triggered: pendingCount > 0,
        reason: pendingCount > 0 ? `${pendingCount} 条待审批提案` : "无待审批提案",
        threshold: "pendingCount > 0",
      },
      analysis: {
        provider: "deepseek",
        model: "deepseek-chat",
      },
      proposal: latestProposal
        ? {
            proposalId: latestProposal.proposalId,
            targetComponent: (latestProposal.proposedChange as Record<string, unknown>)?.targetComponent as
              | "任务边界"
              | "上下文供给"
              | "工具接入"
              | "反馈闭环"
              | "安全护栏"
              | "进化调度器"
              | undefined ?? "进化调度器",
            proposedChange:
              (latestProposal.proposedChange as Record<string, unknown>)?.description as string ??
              latestProposal.problemStatement,
            riskLevel: (latestProposal.severity as "low" | "medium" | "high" | "critical") ?? "medium",
            automationLevel: ((latestProposal.proposedChange as Record<string, unknown>)?.automationLevel as
              | "L1"
              | "L2"
              | "L3"
              | "L4") ?? "L1",
            status: mapStatus(latestProposal.status),
          }
        : null,
      reportMd: undefined,
      logSample: [],
      version: "1.0.0",
    })

    return ApiResponse.ok({
      report,
      pendingCount,
      totalCount,
      latestApproval: latestApproval
        ? {
            id: latestApproval.id,
            actor: latestApproval.actor,
            action: latestApproval.action,
            createdAt: latestApproval.createdAt.toISOString(),
          }
        : null,
    })
  } catch (error) {
    logger.error("GET /api/v1/harness/evaluation-report 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return ApiResponse.error("获取评估报告失败", 500)
  }
}

function mapStatus(dbStatus: string): "pending" | "approved" | "rejected" | "rolled-back" {
  switch (dbStatus) {
    case "approved":
    case "active":
      return "approved"
    case "rejected":
      return "rejected"
    case "rolled_back":
      return "rolled-back"
    default:
      return "pending"
  }
}

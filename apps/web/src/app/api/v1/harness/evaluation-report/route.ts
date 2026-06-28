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
import { EvaluationReportSchema, AuditAction } from "@hermesclaw/event-contracts"

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
    const [totalProposalCount, pendingProposalCount] = await Promise.all([
      prisma.harnessProposal.count({ where: { workspaceId: ctx.workspaceId } }),
      prisma.harnessProposal.count({ where: { workspaceId: ctx.workspaceId, status: { in: ["draft", "pending"] } } }),
    ])

    // 同时从 WorkflowRun 表（A5）读取最近的评测输出，补充 HarnessProposal 缺失时的数据
    const latestA5Run = await prisma.workflowRun.findFirst({
      where: { workspaceId: ctx.workspaceId, agentId: "A5", outputContext: { not: null } } as any,
      orderBy: { completedAt: "desc" },
      select: { outputContext: true, completedAt: true, status: true },
    })

    let parsedEval: { proposalType?: string; title?: string; rationale?: string; estimatedImpact?: string; confidence?: number } = {}
    let a5RunCount = 0
    if (latestA5Run?.outputContext) {
      try {
        const oc = typeof latestA5Run.outputContext === "string"
          ? JSON.parse(latestA5Run.outputContext)
          : latestA5Run.outputContext
        const evalNode = oc?.["eval-read"]?.output ?? oc?.evalOutput
        if (evalNode) {
          parsedEval = {
            proposalType: evalNode.proposalType,
            title: evalNode.title ?? evalNode.rationale?.slice(0, 60),
            rationale: evalNode.rationale,
            estimatedImpact: evalNode.estimatedImpact,
            confidence: evalNode.confidence,
          }
        }
      } catch { /* skip */ }
    }

    // 统计 A5 运行次数
    const a5Stat = await prisma.workflowRun.count({
      where: { workspaceId: ctx.workspaceId, agentId: "A5" },
    })

    // 合并统计：HarnessProposal 表 + A5 WorkflowRun 表
    const totalCount = Math.max(totalProposalCount, a5Stat > 0 ? 1 : 0)
    const pendingCount = totalProposalCount > 0 ? pendingProposalCount : (a5Stat > 0 ? 1 : 0)
    const approvedCount = 0
    const rejectedCount = 0

    // 查最近审批（用于签名区）
    const latestApproval = await prisma.auditLog.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        action: { in: [AuditAction.APPROVAL_GRANTED, AuditAction.APPROVAL_REJECTED] },
      },
      orderBy: { createdAt: "desc" },
    })

    const report = EvaluationReportSchema.parse({
      reportId: latestProposal?.id ?? latestA5Run?.completedAt?.toISOString() ?? `eval-${ctx.workspaceId}`,
      workspaceId: ctx.workspaceId,
      triggeredBy: latestProposal?.triggeredBy === "cron.evaluation" ? "auto" : "manual",
      evaluatedAt: latestProposal?.createdAt?.toISOString() ?? latestA5Run?.completedAt?.toISOString() ?? new Date().toISOString(),
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
        reason: pendingCount > 0 ? `${pendingCount} 条待审批提案 (含 A5 Agent 产出)` : "无待审批提案",
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
              | "任务边界" | "上下文供给" | "工具接入" | "反馈闭环" | "安全护栏" | "进化调度器"
              | undefined ?? "进化调度器",
            proposedChange:
              (latestProposal.proposedChange as Record<string, unknown>)?.description as string ??
              latestProposal.problemStatement,
            riskLevel: (latestProposal.severity as "low" | "medium" | "high" | "critical") ?? "medium",
            automationLevel: ((latestProposal.proposedChange as Record<string, unknown>)?.automationLevel as
              | "L1" | "L2" | "L3" | "L4") ?? "L1",
            status: mapStatus(latestProposal.status),
          }
        : parsedEval.title
          ? {
              proposalId: `a5-${latestA5Run?.completedAt?.getTime() ?? Date.now()}`,
              targetComponent: "进化调度器" as const,
              proposedChange: parsedEval.rationale ?? parsedEval.title ?? "",
              riskLevel: parsedEval.estimatedImpact === "high" ? "high" as const : "medium" as const,
              automationLevel: "L2" as const,
              status: "pending" as const,
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

/**
 * GET /api/v1/audit/latest-approval — 最近审批人签名
 *
 * 返回最近一次 Harness 提案的审批/拒绝记录，
 * 审批人与审批时间来自 AuditLog 真数据。
 *
 * 三域调用点：[控制域] — 审计日志读取。
 */
import { prisma } from "@/lib/prisma"
import { AuditAction } from "@hermesclaw/event-contracts"
import { logger } from "@/lib/logger"
import { ApiResponse } from "@/lib/server/api-response"
import { buildWorkspaceContext } from "@/lib/workspace"

export const runtime = "nodejs"
export const revalidate = 30

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)

    // 查最近一条审批/拒绝动作
    const latestApproval = await prisma.auditLog.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        action: { in: [AuditAction.APPROVAL_GRANTED, AuditAction.APPROVAL_REJECTED, "approve.harness.proposal", "reject.harness.proposal"] },
      },
      orderBy: { createdAt: "desc" },
    })

    // 查对应提案详情（如果有）
    let proposal = null
    if (latestApproval) {
      proposal = await prisma.harnessProposal.findFirst({
        where: {
          workspaceId: ctx.workspaceId,
          id: latestApproval.targetId,
        },
      })
    }

    return ApiResponse.ok({
      latestApproval: latestApproval
        ? {
            id: latestApproval.id,
            actor: latestApproval.actor,
            action: latestApproval.action,
            targetType: latestApproval.targetType,
            targetId: latestApproval.targetId,
            detail: latestApproval.detail,
            createdAt: latestApproval.createdAt.toISOString(),
            status: latestApproval.status,
          }
        : null,
      proposal: proposal
        ? {
            proposalId: proposal.proposalId,
            title: proposal.title,
            status: proposal.status,
            problemStatement: proposal.problemStatement,
          }
        : null,
    })
  } catch (error) {
    logger.error("GET /api/v1/audit/latest-approval 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return ApiResponse.error("获取最近审批记录失败", 500)
  }
}

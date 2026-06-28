/**
 * POST /api/v1/evolution/reject — 拒绝进化提案
 *
 * 更新提案状态为 rejected，写入 AuditLog（evolution.proposal.rejected）。
 *
 * 三域调用点：[控制域] — Hermes 提案决策层
 *
 * 审批门禁：L2 gate（记录原因即可）
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { ApiResponse } from "@/lib/server/api-response"
import { buildWorkspaceContext } from "@/lib/workspace"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { z } from "zod"

export const runtime = "nodejs"

const RejectProposalSchema = z.object({
  proposalId: z.string().min(1),
  /** 拒绝原因（必填） */
  reason: z.string().min(1, "拒绝原因不能为空"),
})

export async function POST(request: Request) {
  let auditEntry = { auditId: "", ok: false }
  try {
    const ctx = await buildWorkspaceContext(request)
    const actor = await actorFromSession()

    const body = await request.json().catch(() => ({}))
    const parsed = RejectProposalSchema.safeParse(body)
    if (!parsed.success) {
      return ApiResponse.error(
        `无效的请求体: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
        400,
      )
    }

    const { proposalId, reason } = parsed.data

    // 查找提案
    const proposal = await prisma.harnessProposal.findFirst({
      where: { proposalId, workspaceId: ctx.workspaceId },
    })

    if (!proposal) {
      return ApiResponse.error("提案不存在", 404)
    }

    // 状态机门禁：只有 draft / pending 状态的提案可以被拒绝
    if (!["draft", "pending"].includes(proposal.status)) {
      return ApiResponse.error(
        `提案状态为 ${proposal.status}，仅 draft/pending 状态可拒绝`,
        409,
      )
    }

    // 审计预记录
    auditEntry = await createAuditEntry({
      actor,
      action: "evolution.proposal.rejected",
      targetType: "proposal",
      targetId: proposalId,
      detail: reason,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
      automationLevel: "L2",
      triggeredBy: "user",
      contextSnapshot: {
        proposalId,
        previousStatus: proposal.status,
        rejectionReason: reason,
      },
    })

    if (!auditEntry.ok) {
      logger.error("[evolution.reject] 审计预记录失败，拒绝执行")
      return ApiResponse.error("治理留痕失败，操作被拒绝", 500)
    }

    // 更新提案状态
    await prisma.harnessProposal.update({
      where: { id: proposal.id },
      data: {
        status: "rejected",
        rejectedBy: actor,
        rejectedAt: new Date(),
        updatedAt: new Date(),
      },
    })

    // 审计记录成功
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "success",
      detail: `已拒绝进化提案 ${proposalId}，原因: ${reason}`,
    })

    logger.info("[evolution.reject] 提案已拒绝", { proposalId, actor })

    return ApiResponse.ok({
      proposalId,
      status: "rejected",
      message: "提案已拒绝",
    })
  } catch (error) {
    if (auditEntry.auditId) {
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "failed",
        detail: `执行异常: ${error instanceof Error ? error.message : "未知错误"}`,
      }).catch(() => {})
    }

    logger.error("POST /api/v1/evolution/reject 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return ApiResponse.error("拒绝进化提案失败", 500)
  }
}

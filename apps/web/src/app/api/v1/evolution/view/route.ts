/**
 * POST /api/v1/evolution/view — 查看进化提案详情
 *
 * 轻量审计埋点：只写 AuditLog（proposal.view），不做状态变更。
 * 由 Panel5 详情弹窗打开时调用。
 *
 * 三域调用点：[控制域] — Hermes 提案决策层（只读审计）
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { ApiResponse } from "@/lib/server/api-response"
import { buildWorkspaceContext } from "@/lib/workspace"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { z } from "zod"

export const runtime = "nodejs"

const ViewProposalSchema = z.object({
  proposalId: z.string().min(1),
})

export async function POST(request: Request) {
  let auditEntry = { auditId: "", ok: false }
  try {
    const ctx = await buildWorkspaceContext(request)
    const actor = await actorFromSession()

    const body = await request.json().catch(() => ({}))
    const parsed = ViewProposalSchema.safeParse(body)
    if (!parsed.success) {
      return ApiResponse.error("无效的请求体: proposalId 必须提供", 400)
    }

    const { proposalId } = parsed.data

    // 查找提案（确认存在即可，不修改状态）
    const proposal = await prisma.harnessProposal.findFirst({
      where: { proposalId, workspaceId: ctx.workspaceId },
      select: { id: true, proposalId: true, severity: true, status: true },
    })

    if (!proposal) {
      return ApiResponse.error("提案不存在", 404)
    }

    // 反查追踪链
    let workflowRunId: string | undefined
    try {
      const a5Run = await prisma.workflowRun.findFirst({
        where: {
          workspaceId: ctx.workspaceId,
          agentId: "A5",
          status: "completed",
        },
        orderBy: { completedAt: "desc" },
        select: { runId: true },
      })
      if (a5Run) workflowRunId = a5Run.runId
    } catch { /* 反查失败不阻塞 */ }

    const derivedTaskId = `task-${proposalId}`
    const derivedRunId = workflowRunId ?? `run-view-${Date.now()}`

    // 审计预记录
    auditEntry = await createAuditEntry({
      actor,
      action: "proposal.view",
      targetType: "proposal",
      targetId: proposalId,
      detail: `查看进化提案 ${proposalId} 详情`,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
      automationLevel: "L1",
      triggeredBy: "user",
      workflowRunId: derivedRunId,
      contextSnapshot: {
        proposalId,
        status: proposal.status,
        taskId: derivedTaskId,
        workflowRunId: derivedRunId,
      },
    })

    if (!auditEntry.ok) {
      logger.warn("[evolution.view] 审计预记录失败（非阻塞）", { proposalId })
    }

    // 审计记录成功
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "success",
      detail: `已查看进化提案 ${proposalId} 详情`,
    }).catch(() => {})

    return ApiResponse.ok({
      proposalId,
      viewed: true,
    })
  } catch (error) {
    if (auditEntry.auditId) {
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "failed",
        detail: `执行异常: ${error instanceof Error ? error.message : "未知错误"}`,
      }).catch(() => {})
    }

    logger.error("POST /api/v1/evolution/view 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    // view 操作失败不返回 500，避免阻塞面板渲染
    return ApiResponse.error("查看提案失败", 200)
  }
}

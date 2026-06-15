import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { createAuditEntry, updateAuditEntry } from "@/lib/server/shared/audit"
import { writeAgentLog } from "@/lib/server/shared/agent-log"
import { checkConfirmQuery, checkAutomationGate } from "@/lib/server/hermes/guardrail"
import { resolveAutomationLevel } from "@/types"
import { HarnessProposalUpdateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext, requireHarnessAdmin } from "@/lib/workspace"

import { HarnessProposalSchema } from '@/contracts'
import type { HarnessProposal } from '@/types'

/** 序列化 HarnessProposal，对齐契约返回格式 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeProposal(proposal: any): HarnessProposal {
  const parsed = HarnessProposalSchema.parse({
    id: proposal.id,
    proposalId: proposal.proposalId,
    workspaceId: proposal.workspaceId,
    triggeredBy: proposal.triggeredBy,
    triggerReason: proposal.triggerReason,
    problemStatement: proposal.problemStatement,
    evidence: proposal.evidence ?? [],
    proposedChange: proposal.proposedChange,
    requiresHumanApproval: proposal.requiresHumanApproval,
    estimatedImpact: proposal.estimatedImpact,
    affectedAgents: proposal.affectedAgents ?? [],
    rollbackPlan: proposal.rollbackPlan,
    status: proposal.status,
    reviewedBy: proposal.reviewedBy ?? null,
    reviewedAt: proposal.reviewedAt ? proposal.reviewedAt.toISOString() : null,
    previousSnapshot: proposal.previousSnapshot ?? null,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
    version: "1.0.0",
  })
  return parsed as HarnessProposal
}

/** GET /api/harness/proposals/[id] —— 获取提案详情 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)

    const queryWhere = id.startsWith("HEP-")
      ? { proposalId: id, workspaceId: ctx.workspaceId }
      : { id, workspaceId: ctx.workspaceId }

    const proposal = await prisma.harnessProposal.findFirst({
      where: queryWhere,
    })

    if (!proposal) {
      return errorResponse("提案不存在", 404)
    }

    return successResponse({
      proposal: serializeProposal(proposal),
    })
  } catch (error) {
    logger.error('GET /api/harness/proposals/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** PATCH /api/harness/proposals/[id] —— 审批操作（approve / reject） */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)
    requireHarnessAdmin(ctx.role)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, HarnessProposalUpdateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const queryWhere = id.startsWith("HEP-")
      ? { proposalId: id, workspaceId: ctx.workspaceId }
      : { id, workspaceId: ctx.workspaceId }

    const existing = await prisma.harnessProposal.findFirst({ where: queryWhere })
    if (!existing) {
      return errorResponse("提案不存在", 404)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propChange = existing.proposedChange as any;
    const automationLevelRaw = propChange?.automationLevel;
    const riskLevelRaw = propChange?.riskLevel;

    // 审批操作
    if (body.action) {
      if (!["approve", "reject"].includes(body.action)) {
        return errorResponse("无效的审批动作，有效值: approve, reject", 400)
      }

      // 自动化授权分级拦截（AGENTS.md §4.7）—— 仅对 approve 生效，reject 永远放行
      if (body.action === "approve") {
        const gateResult = await checkAutomationGate({
          automationLevel: automationLevelRaw,
          riskLevel: riskLevelRaw,
          confirmed: body.confirm === true,
          actionName: "批准",
        })
        if (!gateResult.ok) return gateResult.response
      }

      const automationLevel = resolveAutomationLevel(
        automationLevelRaw,
        riskLevelRaw as "low" | "medium" | "high",
      )

      // AGENTS.md §5 #3 禁止静默执行：执行前写入预记录审计
      const entry = await createAuditEntry({
        actor: body.reviewedBy ?? "system",
        action: body.action === "approve" ? "approve.proposal" : "reject.proposal",
        targetType: "proposal",
        targetId: existing.id,
        detail: `${existing.proposalId} · ${automationLevel}`,
        riskLevel: riskLevelRaw as "low" | "medium" | "high",
        workspaceId: ctx.workspaceId,
        automationLevel: (automationLevelRaw as "L1" | "L2" | "L3" | "L4") ?? undefined,
        triggeredBy: "user",
        contextSnapshot: {
          proposalId: existing.proposalId,
          previousStatus: existing.status,
          action: body.action,
          automationLevel: automationLevelRaw,
          riskLevel: riskLevelRaw,
          reviewer: body.reviewedBy ?? "system",
        },
      })

      const data = {
        status: body.action === "approve" ? "approved" : "rejected",
        reviewedBy: body.reviewedBy ?? "system",
        reviewedAt: new Date(),
      }

      const proposal = await prisma.harnessProposal.update({
        where: { id: existing.id },
        data,
      })

      // 更新预记录为 success
      await updateAuditEntry({
        auditId: entry.auditId,
        status: "success",
        detail: `${existing.proposalId} · ${automationLevel} · ${body.action === "approve" ? "已批准" : "已拒绝"}`,
        contextSnapshot: {
          postStatus: data.status,
          reviewedAt: data.reviewedAt.toISOString(),
        },
      })

      // P0-③ 人工修正事件埋点：提案被拒绝时记录 AgentLog（供 Harness 评估引擎追踪人工纠偏频率）
      if (body.action === "reject") {
        void writeAgentLog({
          source: 'human-correction',
          taskName: `提案已拒绝：${existing.proposalId}`,
          status: 'success',
          duration: '0s',
          detail: `提案 ${existing.proposalId}（目标：${propChange?.targetComponent ?? '未知'}，自动化等级：${automationLevelRaw}）已被 ${body.reviewedBy ?? 'system'} 拒绝`,
          riskLevel: 'medium',
        })
      }

      return successResponse({
        proposal: serializeProposal(proposal),
      })
    }

    // 通用更新
    const data: Record<string, unknown> = {}
    if (body.status !== undefined) data.status = body.status
    if (body.reviewedBy !== undefined) data.reviewedBy = body.reviewedBy
    if (body.reviewedAt !== undefined) {
      data.reviewedAt = body.reviewedAt ? new Date(body.reviewedAt) : null
    }

    const proposal = await prisma.harnessProposal.update({
      where: { id: existing.id },
      data,
    })

    return successResponse({
      proposal: serializeProposal(proposal),
    })
  } catch (error) {
    logger.error('PATCH /api/harness/proposals/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** DELETE /api/harness/proposals/[id] —— 删除提案（需 ?confirm=true） */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)
    requireHarnessAdmin(ctx.role)

    const queryWhere = id.startsWith("HEP-")
      ? { proposalId: id, workspaceId: ctx.workspaceId }
      : { id, workspaceId: ctx.workspaceId }

    const existing = await prisma.harnessProposal.findFirst({ where: queryWhere })
    if (!existing) {
      return errorResponse("提案不存在", 404)
    }

    const guard = await checkConfirmQuery(request, "删除升级提案需二次确认")
    if (!guard.ok) return guard.response

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propChange = existing.proposedChange as any;

    // AGENTS.md §5 #3 禁止静默执行：删除前写入预记录审计
    const entry = await createAuditEntry({
      actor: guard.actor,
      action: "delete.proposal",
      targetType: "proposal",
      targetId: existing.id,
      detail: existing.proposalId,
      riskLevel: "medium",
      workspaceId: ctx.workspaceId,
      automationLevel: "L3",
      triggeredBy: "user",
      contextSnapshot: {
        proposalId: existing.proposalId,
        status: existing.status,
        automationLevel: propChange?.automationLevel,
        riskLevel: propChange?.riskLevel,
      },
    })

    await prisma.harnessProposal.delete({ where: { id: existing.id } })

    // 执行成功 → 更新预记录为 success
    await updateAuditEntry({
      auditId: entry.auditId,
      status: "success",
      detail: `已删除提案 ${existing.proposalId}`,
    })

    return successResponse({ message: "提案已删除" })
  } catch (error) {
    logger.error('DELETE /api/harness/proposals/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

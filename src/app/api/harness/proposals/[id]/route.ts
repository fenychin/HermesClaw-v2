import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  parseJsonField,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { writeAuditLog } from "@/lib/server/audit"
import { checkConfirmQuery } from "@/lib/server/guardrail"
import { automationLevelFromRisk } from "@/types"
import type { AutomationLevel, RiskLevel } from "@/types"
import { HarnessProposalUpdateSchema, validateBody } from "@/lib/validators"

/** 序列化 HarnessProposal，将 JSON 字符串字段反序列化 */
function serializeProposal(proposal: Record<string, unknown>) {
  return {
    ...proposal,
    evidence: parseJsonField(proposal.evidence as string, []),
  }
}

/** GET /api/harness/proposals/[id] —— 获取提案详情 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const proposal = await prisma.harnessProposal.findUnique({
      where: { id },
    })

    if (!proposal) {
      return errorResponse("提案不存在", 404)
    }

    return successResponse({
      proposal: serializeProposal(proposal as unknown as Record<string, unknown>),
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
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, HarnessProposalUpdateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const existing = await prisma.harnessProposal.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse("提案不存在", 404)
    }

    // 审批操作
    if (body.action) {
      if (!["approve", "reject"].includes(body.action)) {
        return errorResponse("无效的审批动作，有效值: approve, reject", 400)
      }

      // 自动化授权分级拦截（AGENTS.md §4.7）—— 仅对 approve 生效，reject 永远放行
      const automationLevel: AutomationLevel =
        (existing.automationLevel as AutomationLevel | null) ??
        automationLevelFromRisk(existing.riskLevel as RiskLevel)

      if (body.action === "approve") {
        // L4：绝对禁止自动，审批通道亦不得放行（任何密码 / Token 均不放行）
        if (automationLevel === "L4") {
          return errorResponse(
            "L4 操作绝对禁止自动执行，须由人工在源业务系统发起，审批通道不予放行",
            403,
          )
        }
        // L3：高风险，须显式二次确认（body.confirm===true），缺失则 409
        if (automationLevel === "L3" && body.confirm !== true) {
          return Response.json(
            {
              success: false,
              error: "L3 高风险操作，确认批准后将立即生效且无法撤销，请二次确认",
              requiresConfirmation: true,
            },
            { status: 409 },
          )
        }
      }

      const data = {
        status: body.action === "approve" ? "approved" : "rejected",
        reviewedBy: body.reviewedBy ?? "system",
        reviewedAt: new Date().toISOString(),
      }

      const proposal = await prisma.harnessProposal.update({
        where: { id },
        data,
      })

      // 审计：记录审批动作（AGENTS.md §4.7：授权分级须可溯源）
      await writeAuditLog({
        actor: data.reviewedBy,
        action: body.action === "approve" ? "approve.proposal" : "reject.proposal",
        targetType: "proposal",
        targetId: id,
        detail: `${existing.proposalId} · ${automationLevel}`,
        riskLevel: existing.riskLevel as "low" | "mid" | "high",
      })

      return successResponse({
        proposal: serializeProposal(proposal as unknown as Record<string, unknown>),
      })
    }

    // 通用更新
    const data: Record<string, unknown> = {}
    if (body.status !== undefined) data.status = body.status
    if (body.reviewedBy !== undefined) data.reviewedBy = body.reviewedBy
    if (body.reviewedAt !== undefined) data.reviewedAt = body.reviewedAt

    const proposal = await prisma.harnessProposal.update({
      where: { id },
      data,
    })

    return successResponse({
      proposal: serializeProposal(proposal as unknown as Record<string, unknown>),
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

    const existing = await prisma.harnessProposal.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse("提案不存在", 404)
    }

    const guard = await checkConfirmQuery(request, "删除升级提案需二次确认")
    if (!guard.ok) return guard.response

    await prisma.harnessProposal.delete({ where: { id } })

    await writeAuditLog({
      actor: guard.actor,
      action: "delete.proposal",
      targetType: "proposal",
      targetId: id,
      detail: existing.proposalId,
      riskLevel: "mid",
    })

    return successResponse({ message: "提案已删除" })
  } catch (error) {
    logger.error('DELETE /api/harness/proposals/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

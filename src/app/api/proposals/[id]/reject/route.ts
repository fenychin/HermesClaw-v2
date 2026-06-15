import { prisma } from "@/lib/prisma"
import { withRBAC } from "@/lib/server/api-handler"
import type { RouteContext } from "@/lib/server/api-handler"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { checkAutomationGate } from "@/lib/server/guardrail"

/**
 * POST /api/proposals/[id]/reject —— 拒绝提案
 *
 * 安全门禁（AGENTS.md §4.7）：
 * - RBAC: 仅 ADMIN/OWNER
 * - L4 → 硬拒绝 403（与 /api/harness/proposals 保持一致）
 * - L3 → reject 操作无需二次确认（confirmed=true）
 */
export const POST = withRBAC<RouteContext<{ id: string }>>(
  async (_request, ctx, routeContext) => {
    try {
      const params = await routeContext.params
      const id = params.id

      const proposal = await prisma.harnessProposal.findUnique({
        where: { id, workspaceId: ctx.workspaceId }, // workspaceId 隔离（AGENTS.md §4.11）
      })

      if (!proposal) {
        return errorResponse("提案未找到", 404)
      }

      if (
        proposal.status !== "draft" &&
        proposal.status !== "pending" &&
        proposal.status !== "canary"
      ) {
        return errorResponse(`当前提案状态为 ${proposal.status}，无法执行拒绝动作`, 400)
      }

      const propChange = (proposal.proposedChange ?? {}) as {
        automationLevel?: string
        riskLevel?: string
      }
      const automationLevelRaw = propChange.automationLevel ?? null
      const riskLevelRaw = propChange.riskLevel ?? "medium"

      // 自动化授权分级门禁（AGENTS.md §4.7）
      // 拒绝操作 L4 也须硬拒绝（防止绕过 approve 直接 reject 后再激活）
      const gate = await checkAutomationGate({
        automationLevel: automationLevelRaw,
        riskLevel: riskLevelRaw,
        confirmed: true, // 拒绝操作无需 L3 二次确认
        actionName: "拒绝",
      })
      if (!gate.ok) {
        return gate.response
      }

      const actor = await actorFromSession()
      const now = new Date()
      const updated = await prisma.harnessProposal.update({
        where: { id },
        data: {
          status: "rejected",
          reviewedBy: actor,
          reviewedAt: now,
        }
      })

      await writeAuditLog({
        actor,
        action: "proposal.reject",
        targetType: "proposal",
        targetId: id,
        detail: `拒绝提案: ${proposal.proposalId}（${gate.level}）`,
        riskLevel: "medium",
        workspaceId: ctx.workspaceId
      })

      return successResponse({ proposal: updated })
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : "操作失败", 500)
    }
  },
  "ADMIN"
)

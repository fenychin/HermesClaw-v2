import { prisma } from "@/lib/prisma"
import { withRBAC } from "@/lib/server/api-handler"
import type { RouteContext } from "@/lib/server/api-handler"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { checkAutomationGate } from "@/lib/server/guardrail"

/**
 * POST /api/proposals/[id]/approve —— 审批通过提案 (改为 canary)
 *
 * 安全门禁（AGENTS.md §4.7）：
 * - RBAC: 仅 ADMIN/OWNER
 * - L4 → 硬拒绝 403（与 /api/harness/proposals 保持一致）
 * - L3 → 需 body.confirmText === '确认执行'，否则 409
 */
export const POST = withRBAC<RouteContext<{ id: string }>>(
  async (request, ctx, routeContext) => {
    try {
      const params = await routeContext.params
      const id = params.id

      // 解析 body（可选 confirmText，L3 需提供）
      let confirmText: string | undefined
      try {
        const raw = await request.json()
        confirmText = typeof raw?.confirmText === "string" ? raw.confirmText : undefined
      } catch {
        // 允许空 body
      }

      const proposal = await prisma.harnessProposal.findUnique({
        where: { id, workspaceId: ctx.workspaceId }, // workspaceId 隔离（AGENTS.md §4.11）
      })

      if (!proposal) {
        return errorResponse("提案未找到", 404)
      }

      if (proposal.status !== "draft" && proposal.status !== "pending") {
        return errorResponse(`当前提案状态为 ${proposal.status}，无法执行审批`, 400)
      }

      const propChange = (proposal.proposedChange ?? {}) as {
        automationLevel?: string
        riskLevel?: string
      }
      const automationLevelRaw = propChange.automationLevel ?? null
      const riskLevelRaw = propChange.riskLevel ?? "medium"

      const actor = await actorFromSession()

      // 自动化授权分级门禁（AGENTS.md §4.7）
      // L4 → 403；L3 缺确认 → 409；L1/L2 → 放行
      const gate = await checkAutomationGate({
        automationLevel: automationLevelRaw,
        riskLevel: riskLevelRaw,
        confirmed: confirmText === "确认执行",
        actionName: "批准",
      })
      if (!gate.ok) {
        // L4 硬拦截须留痕
        if (gate.level === "L4") {
          await writeAuditLog({
            actor,
            action: "proposal.approve.l4_blocked",
            targetType: "proposal",
            targetId: id,
            detail: `L4 动作禁止系统自动审批：${proposal.proposalId}`,
            riskLevel: "high",
            workspaceId: ctx.workspaceId,
          })
        }
        return gate.response
      }

      const now = new Date()
      const updated = await prisma.harnessProposal.update({
        where: { id },
        data: {
          status: "canary",
          reviewedBy: actor,
          reviewedAt: now,
        }
      })

      await writeAuditLog({
        actor,
        action: "proposal.approve",
        targetType: "proposal",
        targetId: id,
        detail: `批准提案并进入灰度观察期 (canary): ${proposal.proposalId}（${gate.level}）`,
        riskLevel: "high",
        workspaceId: ctx.workspaceId
      })

      return successResponse({ proposal: updated })
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : "审批失败", 500)
    }
  },
  "ADMIN"
)

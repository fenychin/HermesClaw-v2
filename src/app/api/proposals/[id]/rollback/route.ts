import { prisma } from "@/lib/prisma"
import { withRBAC } from "@/lib/server/api-handler"
import type { RouteContext } from "@/lib/server/api-handler"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { rollbackHarnessProposal, RollbackException } from "@/lib/server/harness/harness-rollback"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { checkAutomationGate } from "@/lib/server/guardrail"

/**
 * POST /api/proposals/[id]/rollback —— 回滚提案，恢复 Agent 状态快照
 *
 * 安全门禁（AGENTS.md §4.7）：
 * - RBAC: 仅 ADMIN/OWNER
 * - L4 → 硬拒绝 403
 * - L3 → 需 body.confirmationToken === L3_CONFIRMATION_TOKEN，否则 409
 */

const L3_CONFIRMATION_TOKEN =
  process.env["HARNESS_L3_CONFIRMATION_TOKEN"] ?? "确认回滚"

export const POST = withRBAC<RouteContext<{ id: string }>>(
  async (request, ctx, routeContext) => {
    try {
      const params = await routeContext.params
      const id = params.id

      // 解析 body（可选 confirmationToken，L3 需提供）
      let confirmationToken: string | undefined
      try {
        const raw = await request.json()
        confirmationToken =
          typeof raw?.confirmationToken === "string"
            ? raw.confirmationToken
            : undefined
      } catch {
        // 允许空 body（L1/L2 不需要 token）
      }

      const proposal = await prisma.harnessProposal.findUnique({
        where: { id, workspaceId: ctx.workspaceId }, // workspaceId 隔离（AGENTS.md §4.11）
      })

      if (!proposal) {
        return errorResponse("提案未找到", 404)
      }

      const propChange = (proposal.proposedChange ?? {}) as {
        automationLevel?: string
        riskLevel?: string
      }
      const automationLevelRaw = propChange.automationLevel ?? null
      const riskLevelRaw = propChange.riskLevel ?? "high"

      // 自动化授权分级门禁（AGENTS.md §4.7）
      const gate = await checkAutomationGate({
        automationLevel: automationLevelRaw,
        riskLevel: riskLevelRaw,
        confirmed: confirmationToken === L3_CONFIRMATION_TOKEN,
        actionName: "回滚",
      })
      if (!gate.ok) {
        return gate.response
      }

      const actor = await actorFromSession()

      // 调用统一回滚方法（Prisma 事务）
      const result = await rollbackHarnessProposal(id, actor)

      await writeAuditLog({
        actor,
        action: "proposal.rollback",
        targetType: "proposal",
        targetId: id,
        detail: `回滚提案，恢复 Agent 状态: ${proposal.proposalId}（${gate.level}）`,
        riskLevel: "high",
        workspaceId: ctx.workspaceId
      })

      return successResponse({ success: true, result })
    } catch (error) {
      if (error instanceof RollbackException) {
        return errorResponse(error.message, error.status)
      }
      return errorResponse(error instanceof Error ? error.message : "回滚失败", 500)
    }
  },
  "ADMIN"
)

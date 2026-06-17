import { prisma } from "@/lib/prisma"; import { withRBAC } from "@/lib/server/api-handler"
import type { RouteContext } from "@/lib/server/api-handler"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { rollbackHarnessProposal, RollbackException } from "@/lib/server/harness/harness-rollback"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { checkAutomationGate } from "@/lib/server/guardrail"

const L3_CONFIRMATION_TOKEN = process.env["HARNESS_L3_CONFIRMATION_TOKEN"] ?? "确认回滚"

export const POST = withRBAC<RouteContext<{ id: string }>>(async (request: any, ctx: any, routeContext: RouteContext<{ id: string }>) => {
  try {
    const { id } = await routeContext.params; let confirmationToken: string | undefined
    try { const raw = await request.json(); confirmationToken = typeof raw?.confirmationToken === "string" ? raw.confirmationToken : undefined } catch {}
    const proposal = await prisma.harnessProposal.findUnique({ where: { id, workspaceId: ctx.workspaceId } })
    if (!proposal) return errorResponse("提案未找到", 404)
    const propChange = (proposal.proposedChange ?? {}) as any
    const gate = await checkAutomationGate({ automationLevel: propChange.automationLevel ?? null, riskLevel: propChange.riskLevel ?? "high", confirmed: confirmationToken === L3_CONFIRMATION_TOKEN, actionName: "回滚" })
    if (!gate.ok) return gate.response
    const actor = await actorFromSession()
    const result = await rollbackHarnessProposal(id, actor)
    void writeAuditLog({ actor, action: "proposal.rollback", targetType: "proposal", targetId: id, detail: `回滚提案: ${proposal.proposalId}`, riskLevel: "high", workspaceId: ctx.workspaceId })
    return successResponse({ success: true, result })
  } catch (error) { if (error instanceof RollbackException) return errorResponse(error.message, error.status); return errorResponse(error instanceof Error ? error.message : "回滚失败", 500) }
}, "ADMIN")

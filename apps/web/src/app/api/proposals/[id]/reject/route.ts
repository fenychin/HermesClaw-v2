import { prisma } from "@/lib/prisma"; import { withRBAC } from "@/lib/server/api-handler"
import type { RouteContext } from "@/lib/server/api-handler"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { checkAutomationGate } from "@/lib/server/guardrail"

export const POST = withRBAC<RouteContext<{ id: string }>>(async (_request: any, ctx: any, routeContext: RouteContext<{ id: string }>) => {
  try {
    const { id } = await routeContext.params
    const proposal = await prisma.harnessProposal.findUnique({ where: { id, workspaceId: ctx.workspaceId } })
    if (!proposal) return errorResponse("提案未找到", 404)
    if (proposal.status !== "draft" && proposal.status !== "pending" && proposal.status !== "canary") return errorResponse(`当前提案状态为 ${proposal.status}，无法拒绝`, 400)
    const propChange = (proposal.proposedChange ?? {}) as any
    const gate = await checkAutomationGate({ automationLevel: propChange.automationLevel ?? null, riskLevel: propChange.riskLevel ?? "medium", confirmed: true, actionName: "拒绝" })
    if (!gate.ok) return gate.response
    const actor = await actorFromSession()
    const updated = await prisma.harnessProposal.update({ where: { id }, data: { status: "rejected", reviewedBy: actor, reviewedAt: new Date() } })
    void writeAuditLog({ actor, action: "proposal.reject", targetType: "proposal", targetId: id, detail: `拒绝提案: ${proposal.proposalId}`, riskLevel: "medium", workspaceId: ctx.workspaceId })
    return successResponse({ proposal: updated })
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "操作失败", 500) }
}, "ADMIN")

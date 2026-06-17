import { prisma } from "@/lib/prisma"; import { withRBAC } from "@/lib/server/api-handler"
import type { RouteContext } from "@/lib/server/api-handler"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { checkAutomationGate } from "@/lib/server/guardrail"

export const POST = withRBAC<RouteContext<{ id: string }>>(async (request: any, ctx: any, routeContext: RouteContext<{ id: string }>) => {
  try {
    const { id } = await routeContext.params; let confirmText: string | undefined
    try { const raw = await request.json(); confirmText = typeof raw?.confirmText === "string" ? raw.confirmText : undefined } catch {}
    const proposal = await prisma.harnessProposal.findUnique({ where: { id, workspaceId: ctx.workspaceId } })
    if (!proposal) return errorResponse("提案未找到", 404)
    if (proposal.status !== "draft" && proposal.status !== "pending") return errorResponse(`当前提案状态为 ${proposal.status}，无法执行审批`, 400)
    const propChange = (proposal.proposedChange ?? {}) as any; const actor = await actorFromSession()
    const gate = await checkAutomationGate({ automationLevel: propChange.automationLevel ?? null, riskLevel: propChange.riskLevel ?? "medium", confirmed: confirmText === "确认执行", actionName: "批准" })
    if (!gate.ok) { if (gate.level === "L4") void writeAuditLog({ actor, action: "proposal.approve.l4_blocked", targetType: "proposal", targetId: id, detail: `L4 动作禁止审批`, riskLevel: "high", workspaceId: ctx.workspaceId }); return gate.response }
    const updated = await prisma.harnessProposal.update({ where: { id }, data: { status: "canary", reviewedBy: actor, reviewedAt: new Date() } })
    void writeAuditLog({ actor, action: "proposal.approve", targetType: "proposal", targetId: id, detail: `批准提案进入灰度: ${proposal.proposalId}`, riskLevel: "high", workspaceId: ctx.workspaceId })
    return successResponse({ proposal: updated })
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "审批失败", 500) }
}, "ADMIN")

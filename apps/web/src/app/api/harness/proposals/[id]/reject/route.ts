import { ApiResponse } from '@/lib/server/api-response'; import { prisma } from '@/lib/prisma'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { checkAutomationGate } from '@/lib/server/guardrail'
import { createAuditEntry, updateAuditEntry, actorFromSession } from '@/lib/server/audit'
import { resolveAutomationLevel } from '@/types'; import type { WorkspaceContext } from '@/lib/workspace'

export const POST = withRBAC(async (_req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
  const { id } = await routeCtx.params
  const queryWhere = id.startsWith("HEP-") ? { proposalId: id, workspaceId: ctx.workspaceId } : { id, workspaceId: ctx.workspaceId }
  const proposal = await prisma.harnessProposal.findFirst({ where: queryWhere })
  if (!proposal) return ApiResponse.error('提案不存在', 404)
  const propChange = proposal.proposedChange as any; const riskLevelRaw = propChange?.riskLevel; const automationLevelRaw = propChange?.automationLevel
  const actor = await actorFromSession()
  const gate = await checkAutomationGate({ automationLevel: automationLevelRaw ?? null, riskLevel: riskLevelRaw, confirmed: true, actionName: "拒绝" })
  if (!gate.ok) return gate.response
  const entry = await createAuditEntry({ actor, action: 'proposal.reject', targetType: 'proposal', targetId: proposal.id, detail: `拒绝提案 ${proposal.proposalId}`, riskLevel: riskLevelRaw, workspaceId: ctx.workspaceId, triggeredBy: 'user' })
  await prisma.harnessProposal.update({ where: { id: proposal.id }, data: { status: 'rejected', reviewedBy: actor, reviewedAt: new Date() } })
  await updateAuditEntry({ auditId: entry.auditId, status: 'success', detail: `拒绝提案 ${proposal.proposalId}` })
  return ApiResponse.ok({ proposalId: proposal.proposalId, rejectedAt: new Date().toISOString() })
}, 'ADMIN')

import { ApiResponse } from '@/lib/server/api-response'; import { prisma } from '@/lib/prisma'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import type { WorkspaceContext } from '@/lib/workspace'
import { HarnessProposalSchema } from '@hermesclaw/event-contracts'

function serializeP(p: any) { return HarnessProposalSchema.parse({ id: p.id, proposalId: p.proposalId, workspaceId: p.workspaceId, triggeredBy: p.triggeredBy, triggerReason: p.triggerReason, problemStatement: p.problemStatement, evidence: p.evidence ?? [], proposedChange: p.proposedChange, requiresHumanApproval: p.requiresHumanApproval, estimatedImpact: p.estimatedImpact, affectedAgents: p.affectedAgents ?? [], rollbackPlan: p.rollbackPlan, status: p.status === "rolled_back" ? "rolled-back" : p.status, reviewedBy: p.reviewedBy ?? null, reviewedAt: p.reviewedAt?.toISOString() ?? null, previousSnapshot: p.previousSnapshot ?? null, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(), version: "1.0.0" }) }

export const GET = withRBAC(async (req: Request, ctx: WorkspaceContext, _routeCtx: RouteContext) => {
  try {
    const status = new URL(req.url).searchParams.get('status')
    const where = status ? ({ workspaceId: ctx.workspaceId, status } as any) : { workspaceId: ctx.workspaceId }
    const proposals = await prisma.harnessProposal.findMany({ where, orderBy: { createdAt: 'desc' } })
    return ApiResponse.ok({ proposals: proposals.map(serializeP) })
  } catch (error) { return ApiResponse.error(error instanceof Error ? error.message : '未知错误', 500) }
}, 'VIEWER')

import { ApiResponse } from '@/lib/server/shared/api-response'
import { prisma } from '@/lib/prisma'
import { withRBAC, type RouteContext } from '@/lib/server/shared/api-handler'
import type { WorkspaceContext } from '@/lib/workspace'
import type { HarnessProposal } from '@/types'
import { HarnessProposalSchema } from '@/contracts'

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

// GET /api/harness/proposals
// 获取提案列表（RBAC: MEMBER 及以上可读；支持 ?status=pending 筛选）
// —— AGENTS.md §4.11：workspaceId 过滤 + 角色门禁
export const GET = withRBAC(
  async (req: Request, ctx: WorkspaceContext, _routeCtx: RouteContext) => {
    try {
      const { searchParams } = new URL(req.url)
      const status = searchParams.get('status')

      const proposals = await prisma.harnessProposal.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          ...(status ? { status } : {}),
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      const result = proposals.map(serializeProposal)
      return ApiResponse.ok(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(message, 500)
    }
  },
  'MEMBER',
)

import { ApiResponse } from '@/lib/server/api-response'
import { getMockProposal, updateMockProposalStatus } from '@/lib/server/mock-store'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { writeAuditLog, actorFromSession } from '@/lib/server/audit'
import type { WorkspaceContext } from '@/lib/workspace'

// POST /api/harness/proposals/:id/reject
// 拒绝提案（RBAC: 仅 ADMIN/OWNER）
export const POST = withRBAC(
  async (_req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
    const { id } = await routeCtx.params
    try {
      const proposal = getMockProposal(id)
      if (!proposal) return ApiResponse.error('提案不存在', 404)

      updateMockProposalStatus(id, 'rejected')

      await writeAuditLog({
        actor: await actorFromSession(),
        action: 'proposal.reject',
        targetType: 'proposal',
        targetId: id,
        detail: `拒绝提案 ${proposal.proposalId}`,
        riskLevel: 'low',
        workspaceId: ctx.workspaceId,
      })

      return ApiResponse.ok({ proposalId: id, rejectedAt: new Date().toISOString() })
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(message, 500)
    }
  },
  'ADMIN',
)

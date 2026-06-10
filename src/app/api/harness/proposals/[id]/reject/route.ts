import { ApiResponse } from '@/lib/server/api-response'
import { getMockProposal, updateMockProposalStatus } from '@/lib/server/mock-store'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { createAuditEntry, updateAuditEntry, actorFromSession } from '@/lib/server/audit'
import type { WorkspaceContext } from '@/lib/workspace'

// POST /api/harness/proposals/:id/reject
// 拒绝提案（RBAC: 仅 ADMIN/OWNER）
// —— AGENTS.md §5 #3 禁止静默执行：拒绝前写入预记录审计
export const POST = withRBAC(
  async (_req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
    const { id } = await routeCtx.params
    try {
      const proposal = getMockProposal(id)
      if (!proposal) return ApiResponse.error('提案不存在', 404)

      const actor = await actorFromSession()

      // AGENTS.md §5 #3 禁止静默执行：执行前写入预记录
      const entry = await createAuditEntry({
        actor,
        action: 'proposal.reject',
        targetType: 'proposal',
        targetId: id,
        detail: `拒绝提案 ${proposal.proposalId}`,
        riskLevel: 'low',
        workspaceId: ctx.workspaceId,
        automationLevel: 'L1',
        triggeredBy: 'user',
        contextSnapshot: {
          proposalId: proposal.proposalId,
          status: proposal.status,
          riskLevel: proposal.proposedChange.riskLevel,
          automationLevel: proposal.proposedChange.automationLevel,
        },
      })

      updateMockProposalStatus(id, 'rejected')

      // 执行成功 → 更新预记录为 success
      await updateAuditEntry({
        auditId: entry.auditId,
        status: 'success',
        detail: `拒绝提案 ${proposal.proposalId}`,
        contextSnapshot: {
          postStatus: 'rejected',
          rejectedAt: new Date().toISOString(),
        },
      })

      return ApiResponse.ok({ proposalId: id, rejectedAt: new Date().toISOString() })
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(message, 500)
    }
  },
  'ADMIN',
)

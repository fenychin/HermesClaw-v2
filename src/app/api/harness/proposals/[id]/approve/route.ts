import { ApiResponse } from '@/lib/server/api-response'
import { getMockProposal, updateMockProposalStatus } from '@/lib/server/mock-store'
import { checkAutomationGate } from '@/lib/server/guardrail'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { writeAuditLog, actorFromSession } from '@/lib/server/audit'
import type { WorkspaceContext } from '@/lib/workspace'

// POST /api/harness/proposals/:id/approve
// 批准提案（RBAC: 仅 ADMIN/OWNER；L4 硬拒绝 403 L4_FORBIDDEN；L3 缺确认 409）
export const POST = withRBAC(
  async (req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
    const { id } = await routeCtx.params
    try {
      // 处理空 body 的情况
      let body: { confirmText?: string } = {}
      try {
        body = await req.json()
      } catch {
        // 忽略解析错误，允许空 body
      }

      // 从 mock/store 获取提案
      const proposal = getMockProposal(id)
      if (!proposal) return ApiResponse.error('提案不存在', 404)

      const actor = await actorFromSession()

      // 自动化授权分级门禁（AGENTS.md §4.7）—— 统一走共享护栏，避免重复 L4/L3 判定：
      // L4 → 403 { error:'L4_FORBIDDEN' }；L3 缺确认 → 409；L2/L1 放行。
      const gate = await checkAutomationGate({
        automationLevel: proposal.proposedChange.automationLevel ?? null,
        riskLevel: proposal.proposedChange.riskLevel,
        confirmed: body.confirmText === '确认执行',
        actionName: '批准',
      })
      if (!gate.ok) {
        // L4 硬拦截须留痕（§4.3 可溯源）
        if (gate.level === 'L4') {
          await writeAuditLog({
            actor,
            action: 'proposal.approve.l4_blocked',
            targetType: 'proposal',
            targetId: id,
            detail: 'L4 动作禁止系统自动审批，审批 API 硬拒绝',
            riskLevel: 'high',
            workspaceId: ctx.workspaceId,
          })
        }
        return gate.response
      }

      // 更新状态
      updateMockProposalStatus(id, 'approved')

      await writeAuditLog({
        actor,
        action: 'proposal.approve',
        targetType: 'proposal',
        targetId: id,
        detail: `批准提案 ${proposal.proposalId}（${gate.level}）`,
        riskLevel: proposal.proposedChange.riskLevel,
        workspaceId: ctx.workspaceId,
      })

      return ApiResponse.ok({ proposalId: id, approvedAt: new Date().toISOString() })
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(message, 500)
    }
  },
  'ADMIN',
)

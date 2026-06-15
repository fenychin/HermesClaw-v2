import { ApiResponse } from '@/lib/server/shared/api-response'
import { prisma } from '@/lib/prisma'
import { withRBAC, type RouteContext } from '@/lib/server/shared/api-handler'
import { checkAutomationGate } from '@/lib/server/hermes/guardrail'
import { createAuditEntry, updateAuditEntry, actorFromSession } from '@/lib/server/shared/audit'
import { resolveAutomationLevel } from '@/types'
import type { WorkspaceContext } from '@/lib/workspace'
import {
  readIdempotencyKey,
  checkIdempotencyKey,
  storeIdempotencyKey,
} from '@/lib/idempotency'

// POST /api/harness/proposals/:id/reject
// 拒绝提案（RBAC: 仅 ADMIN/OWNER）
// —— AGENTS.md §5 #3 禁止静默执行：拒绝前写入预记录审计
// —— AGENTS.md §3.4：高危治理动作必须具备幂等保护
export const POST = withRBAC(
  async (req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
    const { id } = await routeCtx.params

    // 幂等键命中直接返回缓存的结果
    const idempotencyKey = readIdempotencyKey(req)
    if (idempotencyKey) {
      const hit = await checkIdempotencyKey(ctx.workspaceId, idempotencyKey)
      if (hit) {
        return ApiResponse.ok({
          idempotent: true,
          proposalId: hit.taskId,
          rejectedAt: hit.createdAt.toISOString(),
        })
      }
    }

    try {
      // 从 Prisma 获取提案
      const queryWhere = id.startsWith("HEP-")
        ? { proposalId: id, workspaceId: ctx.workspaceId }
        : { id, workspaceId: ctx.workspaceId }

      const proposal = await prisma.harnessProposal.findFirst({
        where: queryWhere,
      })
      if (!proposal) return ApiResponse.error('提案不存在', 404)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propChange = proposal.proposedChange as any
      const riskLevelRaw = propChange?.riskLevel
      const automationLevelRaw = propChange?.automationLevel

      const actor = await actorFromSession()
      // 使用统一解析函数，禁止自行重算（AGENTS.md §4.7）
      const resolvedLevel = resolveAutomationLevel(
        automationLevelRaw,
        riskLevelRaw,
      )

      // 自动化授权分级门禁（AGENTS.md §4.7）—— L4 硬拒绝
      const gate = await checkAutomationGate({
        automationLevel: automationLevelRaw ?? null,
        riskLevel: riskLevelRaw,
        confirmed: true, // 拒绝操作无需二次确认
        actionName: "拒绝",
      })
      if (!gate.ok) {
        return gate.response
      }

      // AGENTS.md §5 #3 禁止静默执行：执行前写入预记录
      const entry = await createAuditEntry({
        actor,
        action: 'proposal.reject',
        targetType: 'proposal',
        targetId: proposal.id,
        detail: `拒绝提案 ${proposal.proposalId}`,
        riskLevel: riskLevelRaw,
        workspaceId: ctx.workspaceId,
        automationLevel: resolvedLevel,
        triggeredBy: 'user',
        contextSnapshot: {
          proposalId: proposal.proposalId,
          status: proposal.status,
          riskLevel: riskLevelRaw,
          automationLevel: automationLevelRaw,
        },
      })

      // 更新数据库状态
      await prisma.harnessProposal.update({
        where: { id: proposal.id },
        data: {
          status: 'rejected',
          reviewedBy: actor,
          reviewedAt: new Date(),
        },
      })

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

      // 持久化幂等键 → proposalId
      if (idempotencyKey) {
        await storeIdempotencyKey({
          workspaceId: ctx.workspaceId,
          key: idempotencyKey,
          taskId: proposal.proposalId,
          scope: '/api/harness/proposals/reject',
        })
      }

      return ApiResponse.ok({ proposalId: proposal.proposalId, rejectedAt: new Date().toISOString() })
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(message, 500)
    }
  },
  'ADMIN',
)

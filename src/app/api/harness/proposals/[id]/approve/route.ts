import { ApiResponse } from '@/lib/server/api-response'
import { prisma } from '@/lib/prisma'
import { checkAutomationGate } from '@/lib/server/guardrail'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { createAuditEntry, updateAuditEntry, writeAuditLog, actorFromSession } from '@/lib/server/audit'
import type { WorkspaceContext } from '@/lib/workspace'
import { z } from "zod"

/** POST /api/harness/proposals/:id/approve 请求体——仅 confirmText 可选 */
const ApproveProposalSchema = z.object({
  confirmText: z.string().optional(),
})

// POST /api/harness/proposals/:id/approve
// 批准提案（RBAC: 仅 ADMIN/OWNER；L4 硬拒绝 403 L4_FORBIDDEN；L3 缺确认 409）
export const POST = withRBAC(
  async (req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
    const { id } = await routeCtx.params
    const actor = await actorFromSession()

    try {
      // 处理空 body：safeParse 容错，无效 JSON 或 schema 不符时 default 为 {}
      let body: { confirmText?: string } = {}
      try {
        const raw = await req.json()
        const parsed = ApproveProposalSchema.safeParse(raw)
        if (parsed.success) body = parsed.data
      } catch {
        // 忽略 JSON 解析错误，允许空 body
      }

      // 从 Prisma 获取提案
      const queryWhere = id.startsWith("HEP-")
        ? { proposalId: id, workspaceId: ctx.workspaceId }
        : { id, workspaceId: ctx.workspaceId }

      const proposal = await prisma.harnessProposal.findFirst({
        where: queryWhere,
      })
      if (!proposal) return ApiResponse.error('提案不存在', 404)

      const propChange = proposal.proposedChange as any
      const riskLevelRaw = propChange?.riskLevel
      const automationLevelRaw = propChange?.automationLevel

      // AGENTS.md §5 #3 禁止静默执行：执行前写入预记录审计
      const entry = await createAuditEntry({
        actor,
        action: 'proposal.approve',
        targetType: 'proposal',
        targetId: proposal.id,
        detail: `批准提案 ${proposal.proposalId}`,
        riskLevel: riskLevelRaw,
        workspaceId: ctx.workspaceId,
        automationLevel: automationLevelRaw ?? undefined,
        triggeredBy: 'user',
        contextSnapshot: {
          proposalId: proposal.proposalId,
          status: proposal.status,
          riskLevel: riskLevelRaw,
          automationLevel: automationLevelRaw,
          triggeredBy: proposal.triggeredBy,
        },
      })

      // 自动化授权分级门禁（AGENTS.md §4.7）—— 统一走共享护栏，避免重复 L4/L3 判定：
      // L4 → 403 { error:'L4_FORBIDDEN' }；L3 缺确认 → 409；L2/L1 放行。
      const gate = await checkAutomationGate({
        automationLevel: automationLevelRaw ?? null,
        riskLevel: riskLevelRaw,
        confirmed: body.confirmText === '确认执行',
        actionName: '批准',
      })
      if (!gate.ok) {
        // L4 硬拦截须留痕（§4.3 可溯源）—— 预记录更新为 failed
        if (gate.level === 'L4') {
          await writeAuditLog({
            actor,
            action: 'proposal.approve.l4_blocked',
            targetType: 'proposal',
            targetId: proposal.id,
            detail: 'L4 动作禁止系统自动审批，审批 API 硬拒绝',
            riskLevel: 'high',
            workspaceId: ctx.workspaceId,
          })
          // 更新预记录为失败
          await updateAuditEntry({
            auditId: entry.auditId,
            status: 'failed',
            detail: `L4 硬拦截：${gate.level}`,
          })
        } else {
          // L3 缺确认或其他未放行 → 预记录更新为 failed
          await updateAuditEntry({
            auditId: entry.auditId,
            status: 'failed',
            detail: `门禁未放行：${gate.level}`,
          })
        }
        return gate.response
      }

      // 更新数据库状态
      await prisma.harnessProposal.update({
        where: { id: proposal.id },
        data: {
          status: 'approved',
          reviewedBy: actor,
          reviewedAt: new Date(),
        },
      })

      // 执行成功 → 更新预记录为 success（补充审批后 snapshot）
      await updateAuditEntry({
        auditId: entry.auditId,
        status: 'success',
        detail: `批准提案 ${proposal.proposalId}（${gate.level}）—— 状态已变更为 approved`,
        contextSnapshot: {
          ...entry.ok ? {} : {},
          postStatus: 'approved',
          approvedAt: new Date().toISOString(),
          gateLevel: gate.level,
        },
      })

      return ApiResponse.ok({ proposalId: proposal.proposalId, approvedAt: new Date().toISOString() })
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(message, 500)
    }
  },
  'ADMIN',
)

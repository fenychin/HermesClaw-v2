import { ApiResponse } from '@/lib/server/api-response'; import { prisma } from '@/lib/prisma'
import { checkAutomationGate } from '@/lib/server/guardrail'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { createAuditEntry, updateAuditEntry, writeAuditLog, actorFromSession } from '@/lib/server/audit'
import type { WorkspaceContext } from '@/lib/workspace'; import { z } from "zod"

const ApproveProposalSchema = z.object({ confirmText: z.string().optional() })

export const POST = withRBAC(async (req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
  const { id } = await routeCtx.params; const actor = await actorFromSession()
  let body: any = {}; try { const raw = await req.json(); const parsed = ApproveProposalSchema.safeParse(raw); if (parsed.success) body = parsed.data } catch {}
  const queryWhere = id.startsWith("HEP-") ? { proposalId: id, workspaceId: ctx.workspaceId } : { id, workspaceId: ctx.workspaceId }
  const proposal = await prisma.harnessProposal.findFirst({ where: queryWhere })
  if (!proposal) return ApiResponse.error('提案不存在', 404)
  const propChange = proposal.proposedChange as any; const riskLevelRaw = propChange?.riskLevel; const automationLevelRaw = propChange?.automationLevel
  const entry = await createAuditEntry({ actor, action: 'proposal.approve', targetType: 'proposal', targetId: proposal.id, detail: `批准提案 ${proposal.proposalId}`, riskLevel: riskLevelRaw, workspaceId: ctx.workspaceId, automationLevel: automationLevelRaw ?? undefined, triggeredBy: 'user' })
  const gate = await checkAutomationGate({ automationLevel: automationLevelRaw ?? null, riskLevel: riskLevelRaw, confirmed: body.confirmText === '确认执行', actionName: '批准' })
  if (!gate.ok) { await updateAuditEntry({ auditId: entry.auditId, status: 'failed', detail: `门禁未放行：${gate.level}` }); if (gate.level === 'L4') void writeAuditLog({ actor, action: 'proposal.approve.l4_blocked', targetType: 'proposal', targetId: proposal.id, detail: 'L4 动作禁止自动审批', riskLevel: 'high', workspaceId: ctx.workspaceId }); return gate.response }
  await prisma.harnessProposal.update({ where: { id: proposal.id }, data: { status: 'approved', reviewedBy: actor, reviewedAt: new Date() } })
  await updateAuditEntry({ auditId: entry.auditId, status: 'success', detail: `批准提案 ${proposal.proposalId}` })
  return ApiResponse.ok({ proposalId: proposal.proposalId, approvedAt: new Date().toISOString() })
}, 'ADMIN')

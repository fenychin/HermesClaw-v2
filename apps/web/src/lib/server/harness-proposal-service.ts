/**
 * Harness Proposal Mutation Service — 提案审批操作
 */
import { prisma } from "@/lib/prisma"
import { createAuditEntry, updateAuditEntry } from "@/lib/server/audit"
import { writeAgentLog } from "@/lib/server/agent-log"
import { checkAutomationGate } from "@/lib/server/guardrail"
import { HarnessProposalSchema } from "@hermesclaw/event-contracts"

export function serializeProposal(p: any) {
  return HarnessProposalSchema.parse({
    id: p.id, proposalId: p.proposalId, workspaceId: p.workspaceId,
    triggeredBy: p.triggeredBy, triggerReason: p.triggerReason,
    problemStatement: p.problemStatement, evidence: p.evidence ?? [],
    proposedChange: p.proposedChange, requiresHumanApproval: p.requiresHumanApproval,
    estimatedImpact: p.estimatedImpact, affectedAgents: p.affectedAgents ?? [],
    rollbackPlan: p.rollbackPlan, status: p.status === "rolled_back" ? "rolled-back" : p.status,
    reviewedBy: p.reviewedBy ?? null, reviewedAt: p.reviewedAt ? p.reviewedAt.toISOString() : null,
    previousSnapshot: p.previousSnapshot ?? null,
    createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(), version: "1.0.0",
  })
}

export async function findProposalByIdOrAlias(id: string, workspaceId: string) {
  const where = id.startsWith("HEP-") ? { proposalId: id, workspaceId } : { id, workspaceId }
  return prisma.harnessProposal.findFirst({ where })
}

export async function decideProposal(opts: { existing: any; action: "approve" | "reject"; reviewedBy: string; confirm: boolean; workspaceId: string }) {
  const propChange = opts.existing.proposedChange as any
  if (opts.action === "approve") {
    const gate = await checkAutomationGate({ automationLevel: propChange?.automationLevel, riskLevel: propChange?.riskLevel, confirmed: opts.confirm, actionName: "批准" })
    if (!gate.ok) return { ok: false as const, response: gate.response }
  }
  const entry = await createAuditEntry({ actor: opts.reviewedBy, action: opts.action === "approve" ? "approve.proposal" : "reject.proposal", targetType: "proposal", targetId: opts.existing.id, detail: `${opts.existing.proposalId} · ${propChange?.automationLevel}`, riskLevel: propChange?.riskLevel, workspaceId: opts.workspaceId, triggeredBy: "user" })
  const data: any = { status: opts.action === "approve" ? "approved" : "rejected", reviewedBy: opts.reviewedBy, reviewedAt: new Date() }
  const proposal = await prisma.harnessProposal.update({ where: { id: opts.existing.id }, data })
  await updateAuditEntry({ auditId: entry.auditId, status: "success" })
  if (opts.action === "reject") void writeAgentLog({ source: 'human-correction', taskName: `提案已拒绝：${opts.existing.proposalId}`, status: 'success', duration: '0s', detail: `提案已被拒绝`, riskLevel: 'medium' })
  return { ok: true as const, proposal }
}

/**
 * 激活/应用提案修改
 * 如果是技能绑定变更 (skill_binding)，则把变更同步写入 Agent.bindSkills 以及 SkillBinding 关系表
 */
export async function applyProposalChangesIfAny(proposalId: string, tx: any) {
  const proposal = await tx.harnessProposal.findUnique({
    where: { id: proposalId }
  })
  if (!proposal) return

  const proposedChange = typeof proposal.proposedChange === 'string'
    ? JSON.parse(proposal.proposedChange)
    : proposal.proposedChange

  if (proposedChange && proposedChange.targetComponent === 'skill_binding') {
    const { agentId, skillBindings } = proposedChange
    if (agentId && Array.isArray(skillBindings)) {
      // 1. 更新 Agent 中的 bindSkills 字段
      await tx.agent.update({
        where: { id: agentId },
        data: {
          bindSkills: JSON.stringify(skillBindings)
        }
      })

      // 2. 更新 SkillBinding 关系表
      // 先删除现有的所有绑定
      await tx.skillBinding.deleteMany({
        where: { agentId }
      })
      // 再重新插入新的绑定
      for (const skillId of skillBindings) {
        await tx.skillBinding.create({
          data: {
            workspaceId: proposal.workspaceId,
            agentId,
            skillId
          }
        })
      }
    }
  }
}


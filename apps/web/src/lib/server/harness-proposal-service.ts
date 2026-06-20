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
    rollbackPlan: p.rollbackPlan, status: p.status,
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

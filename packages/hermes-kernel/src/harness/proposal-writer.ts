import type { EvaluationResult } from './index'

export interface WriteProposalsParams {
  workspaceId: string
  results: EvaluationResult[]
  prisma: any
  triggeredBy?: string
}

export async function writeProposalsFromEvaluation(
  params: WriteProposalsParams,
): Promise<{ created: number; skipped: number }> {
  const { workspaceId, results, prisma, triggeredBy } = params
  let created = 0
  let skipped = 0

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  for (const result of results) {
    const existing = await prisma.harnessProposal.findFirst({
      where: {
        workspaceId,
        proposalType: result.proposalType,
        signalSnapshot: { contains: result.signal.type },
        createdAt: { gte: sevenDaysAgo },
        status: { in: ['pending', 'draft'] },
      },
    })

    if (existing) {
      skipped++
      continue
    }

    const timestamp = Date.now().toString(36).toUpperCase()
    const seq = Math.random().toString(36).substring(2, 6).toUpperCase()
    await prisma.harnessProposal.create({
      data: {
        proposalId: `HEP-${timestamp}-${seq}`,
        title: `[${result.signal.type}] ${result.suggestion.slice(0, 60)}`,
        severity: result.severity,
        proposalType: result.proposalType,
        status: result.severity === 'critical' ? 'pending' : 'draft',
        signalSnapshot: JSON.stringify(result.signal),
        triggeredBy: triggeredBy ?? 'cron.evaluation',
        triggerReason: `Auto-generated from signal: ${result.signal.type}`,
        problemStatement: result.suggestion,
        proposedChange: { description: result.suggestion, targetComponent: result.proposalType, riskLevel: result.severity, automationLevel: 'L2' },
        estimatedImpact: `Affects ${result.signal.count} occurrences of ${result.signal.type}`,
        rollbackPlan: 'Revert to previous configuration',
        workspaceId,
      },
    })
    created++
  }

  await prisma.auditLog.create({
    data: {
      action: 'harness.proposals.auto_generated',
      actor: 'system',
      targetType: 'proposal',
      targetId: workspaceId,
      detail: JSON.stringify({ count: created }),
      workspaceId,
    },
  })

  return { created, skipped }
}

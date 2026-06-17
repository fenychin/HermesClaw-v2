export function runHarnessEvaluation(): boolean {
  return true;
}

export async function getHarnessStatus(
  prisma: any,
  workspaceId: string,
  evalWindowHours: number
) {
  const [latest, pendingCount, totalProposals] = await Promise.all([
    prisma.harnessProposal.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.harnessProposal.count({ where: { status: "pending", workspaceId } }),
    prisma.harnessProposal.count({ where: { workspaceId } }),
  ])

  const lastEvaluatedAt = latest?.createdAt.toISOString() ?? null
  const nextEvaluatedAt = latest
    ? new Date(
        latest.createdAt.getTime() + evalWindowHours * 60 * 60 * 1000,
      ).toISOString()
    : null

  return {
    lastEvaluatedAt,
    nextEvaluatedAt,
    pendingCount,
    totalProposals,
    intervalHours: evalWindowHours,
  }
}


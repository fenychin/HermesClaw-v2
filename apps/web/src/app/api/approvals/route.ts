import { withRBAC } from "@/lib/server/api-handler"; import { expireStaleCheckpoints } from "@/lib/server/approval"; import { prisma } from "@/lib/prisma"

export const GET = withRBAC(async (request: any, ctx: any) => {
  const { searchParams } = new URL(request.url); const status = searchParams.get("status") || "pending"
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1)
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10), 1), 100)
  await expireStaleCheckpoints(ctx.workspaceId)
  const whereClause: any = { workspaceId: ctx.workspaceId }; if (status !== "all") whereClause.decision = status
  const [records, total] = await Promise.all([prisma.approvalCheckpoint.findMany({ where: whereClause, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }), prisma.approvalCheckpoint.count({ where: whereClause })])
  const logs = records.length > 0 ? await prisma.auditLog.findMany({ where: { action: "approval.requested", targetId: { in: records.map((r: any) => r.checkpointId) } }, select: { targetId: true, actor: true } }) : []
  const logMap = new Map(logs.map((l: any) => [l.targetId, l.actor])); const now = Date.now()
  const checkpoints = records.map((r: any) => ({ id: r.checkpointId, checkpointId: r.checkpointId, taskId: r.taskId ?? undefined, workflowRunId: r.workflowRunId ?? undefined, proposalId: r.proposalId ?? undefined, riskLevel: r.riskLevel, automationLevel: r.automationLevel, actionType: r.actionSummary?.split("：")[1] || r.actionSummary?.split(":")[1] || r.actionSummary, actionSummary: r.actionSummary, status: r.decision, createdAt: r.createdAt, expiresAt: r.expiresAt, requestedBy: logMap.get(r.checkpointId) || "system", remainingMs: Math.max(0, new Date(r.expiresAt).getTime() - now) }))
  return Response.json({ success: true, data: { checkpoints, total } })
}, "VIEWER")

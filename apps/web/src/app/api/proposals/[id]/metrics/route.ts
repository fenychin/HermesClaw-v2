import { prisma } from "@/lib/prisma"
import { successResponse, errorResponse } from "@/lib/api-utils"
import type { RouteContext } from "@/lib/server/api-handler"

export async function GET(_request: Request, routeContext: RouteContext<{ id: string }>) {
  try {
    const { id } = await routeContext.params
    const proposal = await prisma.harnessProposal.findUnique({ where: { id } })
    if (!proposal) return errorResponse("未找到对应升级提案", 404)
    const monitorSince = proposal.reviewedAt ? new Date(proposal.reviewedAt) : new Date(proposal.createdAt)
    const logs = await prisma.agentLog.findMany({ where: { workspaceId: proposal.workspaceId, createdAt: { gte: monitorSince } }, select: { status: true, detail: true, taskName: true, createdAt: true }, orderBy: { createdAt: "desc" } })
    const totalErrors = logs.filter((l: any) => l.status === "failed" || l.status === "error").length
    const errorRate = logs.length > 0 ? totalErrors / logs.length : 0
    const successRate = logs.length > 0 ? (logs.length - totalErrors) / logs.length : 1
    return successResponse({ proposalId: proposal.proposalId, status: proposal.status, monitorSince: monitorSince.toISOString(), metrics: { totalLogs: logs.length, totalErrors, errorRate, successRate, recentErrors: logs.filter((l: any) => l.status === "failed" || l.status === "error").slice(0, 5).map((l: any) => ({ taskName: l.taskName, detail: l.detail || "未知", createdAt: l.createdAt.toISOString() })) } })
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "获取监控指标失败", 500) }
}

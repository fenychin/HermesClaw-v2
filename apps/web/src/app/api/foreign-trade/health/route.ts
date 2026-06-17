import { logger } from "@/lib/logger"; import { successResponse, errorResponse } from "@/lib/api-utils"
import { withRBAC } from "@/lib/server/api-handler"; import { getIndustryHealthData } from "@/lib/server/industry-health"
import type { WorkspaceContext } from "@/lib/workspace"
export const runtime = "nodejs"

export const GET = withRBAC(async (_request: Request, ctx: WorkspaceContext) => {
  try {
    const data = await getIndustryHealthData("foreign-trade", ctx.workspaceId || "default")
    return successResponse({
      successRate: data.successRate, errorRate: data.errorRate, avgDurationMs: data.avgDurationMs, totalRuns: data.totalRuns,
      recentRuns: data.recentRuns.map((r: any) => ({ id: r.id, workflowId: r.workflowId, status: r.status, trigger: r.trigger, startedAt: r.startedAt?.toISOString() ?? null, finishedAt: r.finishedAt?.toISOString() ?? null, error: r.error })),
      nodeRuns: data.nodeRuns.map((n: any) => ({ id: n.id, runId: n.runId, nodeId: n.nodeId, kind: n.kind, status: n.status, error: n.error, finishedAt: n.finishedAt?.toISOString() ?? null })),
      evolutionLogs: data.evolutionLogs.map((e: any) => ({ id: e.id, triggeredBy: e.triggeredBy, evaluatedAt: e.evaluatedAt.toISOString(), triggered: e.triggered, errorRate: e.errorRate, successRate: e.successRate, totalLogs: e.totalLogs, model: e.model, reason: e.reason, reportMd: e.reportMd, reportId: e.reportId, analysisDurationSeconds: e.analysisDurationSeconds })),
      auditLogs: data.auditLogs.map((a: any) => ({ id: a.id, actor: a.actor, action: a.action, targetType: a.targetType, targetId: a.targetId, detail: a.detail, riskLevel: a.riskLevel, automationLevel: a.automationLevel, triggeredBy: a.triggeredBy, createdAt: a.createdAt.toISOString() })),
    })
  } catch (error) { logger.error("GET /api/foreign-trade/health: 失败"); return errorResponse("获取外贸健康度数据失败") }
}, "VIEWER")

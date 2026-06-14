import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { withRBAC } from "@/lib/server/api-handler"
import { getIndustryHealthData } from "@/lib/server/industry-health"
import type { WorkspaceContext } from "@/lib/workspace"

export const runtime = "nodejs"

/**
 * GET /api/foreign-trade/health —— 获取外贸 pack 工作流的实时健康度数据与自演化日志
 *
 * 路由形态保留为外贸专用入口（兼容现有 UI），但内部数据采集已下沉为通用
 * `getIndustryHealthData(packId, workspaceId)`，packId 在路由层显式传入。
 */
export const GET = withRBAC(
  async (request: Request, ctx: WorkspaceContext) => {
    try {
      const workspaceId = ctx.workspaceId || "default"
      const data = await getIndustryHealthData("foreign-trade", workspaceId)

      return successResponse({
        successRate: data.successRate,
        errorRate: data.errorRate,
        avgDurationMs: data.avgDurationMs,
        totalRuns: data.totalRuns,
        recentRuns: data.recentRuns.map((r) => ({
          id: r.id,
          workflowId: r.workflowId,
          status: r.status,
          trigger: r.trigger,
          startedAt: r.startedAt.toISOString(),
          finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
          error: r.error,
        })),
        nodeRuns: data.nodeRuns.map((n) => ({
          id: n.id,
          runId: n.runId,
          nodeId: n.nodeId,
          kind: n.kind,
          status: n.status,
          error: n.error,
          finishedAt: n.finishedAt ? n.finishedAt.toISOString() : null,
        })),
        evolutionLogs: data.evolutionLogs.map((e) => ({
          id: e.id,
          triggeredBy: e.triggeredBy,
          evaluatedAt: e.evaluatedAt.toISOString(),
          triggered: e.triggered,
          errorRate: e.errorRate,
          successRate: e.successRate,
          totalLogs: e.totalLogs,
          model: e.model,
          reason: e.reason,
          reportMd: e.reportMd,
          reportId: e.reportId,
          analysisDurationSeconds: e.analysisDurationSeconds,
        })),
        auditLogs: data.auditLogs.map((a) => ({
          id: a.id,
          actor: a.actor,
          action: a.action,
          targetType: a.targetType,
          targetId: a.targetId,
          detail: a.detail,
          riskLevel: a.riskLevel,
          automationLevel: a.automationLevel,
          triggeredBy: a.triggeredBy,
          createdAt: a.createdAt.toISOString(),
        })),
      })
    } catch (error) {
      logger.error("GET /api/foreign-trade/health: 失败", {
        error: error instanceof Error ? error.message : "未知错误",
      })
      return errorResponse("获取外贸健康度数据失败")
    }
  },
  "VIEWER",
)

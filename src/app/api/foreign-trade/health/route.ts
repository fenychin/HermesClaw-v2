import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { withRBAC } from "@/lib/server/api-handler"
import { calculateWorkflowHealth } from "@/lib/server/foreign-trade"
import type { WorkspaceContext } from "@/lib/workspace"

export const runtime = "nodejs"

// 外贸工作流的静态与常用 ID 列表，配合数据库模糊检索使用
const TRADE_WORKFLOW_IDS = [
  "inquiry-grade",
  "dev-letter",
  "customer-profile",
  "quote-gen",
  "sample-mgmt",
  "order-push",
  "exhibition-leads",
  "followup-remind",
]

/**
 * 可注入依赖接口（提高 API 路由的测试友好性）
 */
export interface ForeignTradeHealthDeps {
  prisma: typeof prisma;
}

const defaultDeps: ForeignTradeHealthDeps = {
  prisma,
};

/**
 * 核心逻辑处理函数 (支持依赖注入，与 API 协议分离)
 */
export async function getForeignTradeHealthData(
  workspaceId: string,
  deps: ForeignTradeHealthDeps = defaultDeps,
) {
  // 1. 获取外贸相关的工作流定义 IDs
  const dbWorkflows = await deps.prisma.workflow.findMany({
    where: {
      workspaceId,
      OR: [
        { name: { contains: "询盘" } },
        { name: { contains: "开发信" } },
        { name: { contains: "客户画像" } },
        { name: { contains: "报价" } },
        { name: { contains: "样品" } },
        { name: { contains: "订单" } },
        { name: { contains: "展会" } },
        { name: { contains: "跟进" } },
        { description: { contains: "询盘" } },
        { description: { contains: "外贸" } },
      ],
    },
    select: { id: true },
  })

  const dbWorkflowIds = dbWorkflows.map((w) => w.id)
  const allTargetWorkflowIds = Array.from(
    new Set([...TRADE_WORKFLOW_IDS, ...dbWorkflowIds]),
  )

  // 2. 查询最近 20 次外贸工作流运行记录
  const recentRuns = await deps.prisma.workflowRun.findMany({
    where: {
      workspaceId,
      workflowId: { in: allTargetWorkflowIds },
    },
    orderBy: { startedAt: "desc" },
    take: 20,
  })

  // 3. 调用业务统计纯函数计算健康指标
  const { successRate, errorRate, avgDurationMs, totalRuns } =
    calculateWorkflowHealth(recentRuns)

  // 4. 获取最近的节点运行状态与失败原因统计
  const runIds = recentRuns.map((r) => r.id)
  const nodeRuns = await deps.prisma.workflowNodeRun.findMany({
    where: {
      workspaceId,
      runId: { in: runIds },
    },
    orderBy: { finishedAt: "desc" },
    take: 50,
  })

  // 5. 获取针对外贸岗位的自演化日志
  const evolutionLogs = await deps.prisma.evolutionLog.findMany({
    where: { workspaceId },
    orderBy: { evaluatedAt: "desc" },
    take: 5,
  })

  // 6. 获取最近相关的治理事件审计日志
  const auditLogs = await deps.prisma.auditLog.findMany({
    where: {
      workspaceId,
      OR: [
        { action: { contains: "harness" } },
        { action: { contains: "proposal" } },
        { action: { contains: "workflow.node" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  return {
    successRate,
    errorRate,
    avgDurationMs,
    totalRuns,
    recentRuns,
    nodeRuns,
    evolutionLogs,
    auditLogs,
  }
}

/**
 * GET /api/foreign-trade/health —— 获取外贸工作流执行的实时健康度数据与自演化日志
 */
export const GET = withRBAC(
  async (request: Request, ctx: WorkspaceContext) => {
    try {
      const workspaceId = ctx.workspaceId || "default"
      const data = await getForeignTradeHealthData(workspaceId)

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

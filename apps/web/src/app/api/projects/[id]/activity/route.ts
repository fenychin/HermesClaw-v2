/**
 * GET /api/projects/[id]/activity
 *
 * 返回项目级活动流：AgentLog + AuditLog，按时间倒序合并。
 * 用于项目详情页"动态"Tab 的真实数据源。
 *
 * 归属域：Hermes（控制核监控层）
 * 输入契约：projectId (URL param) + workspaceId (from session)
 * 输出契约：{ events: UnifiedActivityEvent[] }
 * 过滤逻辑：AgentLog 通过 workflowRunId 关联到本项目的 WorkflowRun 进行过滤
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext, type WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"

interface UnifiedActivityEvent {
  id: string
  type: "agent-log" | "audit-log"
  action: string
  detail: string
  actor: string
  status: string
  riskLevel: string | null
  timestamp: string
  workflowRunId: string | null
}

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext, routeCtx: any) => {
  try {
    const { id: projectId } = await routeCtx.params
    const url = new URL(request.url)
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1), 100)

    // 验证项目归属
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: ctx.workspaceId },
      select: { id: true },
    })
    if (!project) return errorResponse("项目不存在", 404)

    // 1. 查找属于本项目的 workflowRun IDs（作为 AgentLog 过滤依据）
    const projectRuns = await prisma.workflowRun.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        OR: [
          { inputContext: { path: "$.projectId", equals: projectId } } as any,
          { input: { contains: projectId } },
        ],
      },
      select: { runId: true },
    })
    const projectRunIds = projectRuns.map((r: { runId: string }) => r.runId)

    // 2. 并行查询 AgentLog + AuditLog
    const [agentLogs, auditLogs] = await Promise.all([
      // AgentLog：仅取属于本项目的 workflowRun 的日志
      projectRunIds.length > 0
        ? prisma.agentLog.findMany({
            where: {
              workspaceId: ctx.workspaceId,
              workflowRunId: { in: projectRunIds },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: {
              id: true, agentId: true, source: true, taskName: true,
              status: true, detail: true, riskLevel: true,
              workflowRunId: true, createdAt: true,
            },
          })
        : Promise.resolve([]),
      // AuditLog：按 projectId 直接/间接关联
      prisma.auditLog.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          OR: [
            { targetId: projectId },
            { targetType: "project", targetId: projectId },
            { workflowRunId: { in: projectRunIds.length > 0 ? projectRunIds : ["__none__"] } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true, actor: true, action: true, detail: true,
          targetType: true, targetId: true, riskLevel: true,
          status: true, workflowRunId: true, createdAt: true,
        },
      }),
    ]).catch((err) => {
      logger.error("GET /api/projects/[id]/activity: 查询失败", { error: err instanceof Error ? err.message : "未知" })
      return [[], []] as [any[], any[]]
    })

    // 3. 合并 + 排序
    const agentEvents: UnifiedActivityEvent[] = agentLogs.map((a: any) => ({
      id: a.id,
      type: "agent-log" as const,
      action: a.taskName,
      detail: a.detail ?? "",
      actor: a.agentId || a.source || "system",
      status: a.status,
      riskLevel: a.riskLevel,
      timestamp: a.createdAt.toISOString(),
      workflowRunId: a.workflowRunId,
    }))

    const auditEvents: UnifiedActivityEvent[] = auditLogs.map((a: any) => ({
      id: a.id,
      type: "audit-log" as const,
      action: a.action,
      detail: a.detail ?? "",
      actor: a.actor || "system",
      status: a.status,
      riskLevel: a.riskLevel,
      timestamp: a.createdAt.toISOString(),
      workflowRunId: a.workflowRunId,
    }))

    const events = [...agentEvents, ...auditEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)

    return successResponse({ events, total: events.length, projectId })
  } catch (error) {
    logger.error("GET /api/projects/[id]/activity: 失败", { error: error instanceof Error ? error.message : "未知" })
    return errorResponse("服务器内部错误")
  }
}, "VIEWER")

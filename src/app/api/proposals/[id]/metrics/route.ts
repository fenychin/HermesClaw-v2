import { prisma } from "@/lib/prisma"
import { successResponse, errorResponse } from "@/lib/api-utils"
import type { RouteContext } from "@/lib/server/api-handler"

/**
 * GET /api/proposals/[id]/metrics —— 获取提案在灰度期 (Canary) 内的监控指标数据
 */
export async function GET(
  request: Request,
  routeContext: RouteContext<{ id: string }>
) {
  try {
    const params = await routeContext.params
    const id = params.id

    const proposal = await prisma.harnessProposal.findUnique({
      where: { id }
    })

    if (!proposal) {
      return errorResponse("未找到对应升级提案", 404)
    }

    const workspaceId = proposal.workspaceId
    // 如果没有被审批 reviewedAt，就使用创建时间作为观察起点
    const monitorSince = proposal.reviewedAt 
      ? new Date(proposal.reviewedAt) 
      : new Date(proposal.createdAt)

    // 读取从观察起点开始本 Workspace 下的 AgentLog 记录
    const logs = await prisma.agentLog.findMany({
      where: {
        workspaceId,
        createdAt: {
          gte: monitorSince
        }
      },
      select: {
        status: true,
        detail: true,
        taskName: true,
        createdAt: true
      },
      orderBy: {
        createdAt: "desc"
      }
    })

    const totalLogs = logs.length
    const errorLogs = logs.filter(l => l.status === "failed" || l.status === "error")
    const totalErrors = errorLogs.length

    const errorRate = totalLogs > 0 ? totalErrors / totalLogs : 0
    const successRate = totalLogs > 0 ? (totalLogs - totalErrors) / totalLogs : 1

    // 获取最近的一些错误详情作为证据
    const recentErrors = errorLogs.slice(0, 5).map(l => ({
      taskName: l.taskName,
      detail: l.detail || "未知错误原因",
      createdAt: l.createdAt.toISOString()
    }))

    return successResponse({
      proposalId: proposal.proposalId,
      status: proposal.status,
      monitorSince: monitorSince.toISOString(),
      metrics: {
        totalLogs,
        totalErrors,
        errorRate,
        successRate,
        recentErrors
      }
    })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "获取监控指标失败", 500)
  }
}

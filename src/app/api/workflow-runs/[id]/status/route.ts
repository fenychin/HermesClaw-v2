import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { getWorkflowRunStatus } from '@/lib/server/workflow/runtime-engine'
import { prisma } from '@/lib/prisma'

export const GET = withRBAC(
  async (req: Request, ctx: any, routeCtx: any) => {
    const { id } = await routeCtx.params

    try {
      const statusData = await getWorkflowRunStatus(id, ctx.workspaceId)
      const { run, steps, summary } = statusData

      // 1. 计算进度百分比
      const total = summary.total || 0
      const completedAndSkipped = (summary.completed || 0) + (summary.skipped || 0)
      const progress = total > 0 ? Math.round((completedAndSkipped / total) * 100) : 0

      // 2. 获取当前运行节点 ID
      const runningStep = steps.find(s => s.status === 'running')
      const currentNodeId = runningStep ? runningStep.nodeId : (steps.find(s => s.status === 'pending')?.nodeId || null)

      // 3. 关联查询 AuditLog 取得最近 5 条作为 ExecutionEvent
      const logs = await prisma.auditLog.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          targetId: { in: [run.id, id] }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      })

      const executionEvents = logs.map(log => ({
        eventId: log.id,
        taskId: log.targetId,
        workflowRunId: id,
        runtimeId: 'openclaw-runtime',
        eventType: log.action,
        status: log.status,
        timestamp: log.createdAt.toISOString(),
        payload: { detail: log.detail }
      }))

      return ApiResponse.ok({
        status: run.status,
        currentNodeId,
        progress,
        errorMessage: run.errorMessage || run.error || null,
        completedAt: run.completedAt || run.finishedAt || null,
        executionEvents
      })
    } catch (err: any) {
      return ApiResponse.apiError(err.message, 404, 'NOT_FOUND')
    }
  },
  'MEMBER'
)

import { ApiResponse } from '@/lib/server/api-response'; import { withRBAC } from '@/lib/server/api-handler'
import { getWorkflowRunStatus } from '@/lib/server/workflow/runtime-engine'; import { prisma } from '@/lib/prisma'

export const GET = withRBAC(async (_req: Request, ctx: any, routeCtx: any) => {
  const { id } = await routeCtx.params
  try {
    const { run, steps, summary } = await getWorkflowRunStatus(id, ctx.workspaceId)
    const total = summary.total || 0; const progress = total > 0 ? Math.round(((summary.completed || 0) + (summary.skipped || 0)) / total * 100) : 0
    const runningStep = steps.find((s: any) => s.status === 'running')
    const currentNodeId = runningStep?.nodeId || steps.find((s: any) => s.status === 'pending')?.nodeId || null
    const logs = await prisma.auditLog.findMany({ where: { workspaceId: ctx.workspaceId, targetId: { in: [run.id, id] } }, orderBy: { createdAt: 'desc' }, take: 5 })
    let checkpointId = null
    if (run.status === 'waiting') {
      const cp = await prisma.approvalCheckpoint.findFirst({
        where: { workflowRunId: id, decision: 'pending' },
        orderBy: { createdAt: 'desc' }
      })
      checkpointId = cp?.checkpointId || null
    }

    return ApiResponse.ok({
      status: run.status,
      currentNodeId,
      progress,
      checkpointId,
      steps: steps.map((s: any) => ({
        nodeId: s.nodeId,
        nodeType: s.nodeType,
        status: s.status,
        outputData: s.outputData,
        errorMessage: s.errorMessage
      })),
      errorMessage: run.errorMessage || run.error || null,
      completedAt: run.completedAt || run.finishedAt || null,
      executionEvents: logs.map((log: any) => ({
        eventId: log.id,
        taskId: log.targetId,
        workflowRunId: id,
        runtimeId: 'openclaw-runtime',
        eventType: log.action,
        status: log.status,
        timestamp: log.createdAt.toISOString(),
        payload: { detail: log.detail }
      }))
    })
  } catch (err: any) { return ApiResponse.apiError(err.message, 404, 'NOT_FOUND') }
}, 'MEMBER')

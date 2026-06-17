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
    return ApiResponse.ok({ status: run.status, currentNodeId, progress, errorMessage: run.errorMessage || run.error || null, completedAt: run.completedAt || run.finishedAt || null, executionEvents: logs.map((log: any) => ({ eventId: log.id, taskId: log.targetId, workflowRunId: id, runtimeId: 'openclaw-runtime', eventType: log.action, status: log.status, timestamp: log.createdAt.toISOString(), payload: { detail: log.detail } })) })
  } catch (err: any) { return ApiResponse.apiError(err.message, 404, 'NOT_FOUND') }
}, 'MEMBER')

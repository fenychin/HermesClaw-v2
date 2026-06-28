import { ApiResponse } from '@/lib/server/api-response'; import { withRBAC } from '@/lib/server/api-handler'
import { getWorkflowRunStatus } from '@/lib/server/workflow/runtime-engine'; import { prisma } from '@/lib/prisma'

export const GET = withRBAC(async (_req: Request, ctx: any, routeCtx: any) => {
  const { id } = await routeCtx.params
  try {
    const { run, steps, summary } = await getWorkflowRunStatus(id, ctx.workspaceId)
    const total = summary.total || 0; const progress = total > 0 ? Math.round(((summary.completed || 0) + (summary.skipped || 0)) / total * 100) : 0
    const runningStep = steps.find((s: any) => s.status === 'running')
    const currentNodeId = runningStep?.nodeId || steps.find((s: any) => s.status === 'pending')?.nodeId || null

    // 审计日志：最近 5 条（作为执行审计证据，明确标注数据源）
    const logs = await prisma.auditLog.findMany({
      where: { workspaceId: ctx.workspaceId, workflowRunId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    // 动作回执：来自 ActionReceipt 表，是外部执行的真实证据
    const receipts = await prisma.actionReceipt.findMany({
      where: { workspaceId: ctx.workspaceId, workflowRunId: id },
      orderBy: { executedAt: 'desc' },
      take: 20,
    })

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
      // 审计日志（标注数据源，不再伪装为 executionEvent）
      auditLogs: logs.map((log: any) => ({
        auditId: log.id,
        actor: log.actor,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        detail: log.detail,
        riskLevel: log.riskLevel,
        automationLevel: log.automationLevel,
        status: log.status,
        triggeredBy: log.triggeredBy,
        timestamp: log.createdAt.toISOString(),
        contextSnapshot: log.contextSnapshot,
      })),
      // 动作回执（真实 ActionReceipt 数据）
      actionReceipts: receipts.map((r: any) => ({
        receiptId: r.receiptId,
        receiptHash: r.receiptHash,
        taskId: r.taskId,
        connectorId: r.connectorId,
        outcome: r.outcome,
        executedAt: r.executedAt.toISOString(),
        errorCode: r.errorCode,
        failureReason: r.failureReason,
        retryable: r.retryable,
        durationMs: r.durationMs,
        version: r.version,
      })),
    })
  } catch (err: any) { return ApiResponse.apiError(err.message, 404, 'NOT_FOUND') }
}, 'MEMBER')

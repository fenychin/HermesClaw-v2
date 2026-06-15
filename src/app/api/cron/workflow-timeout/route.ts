import { ApiResponse } from '@/lib/server/api-response'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/server/audit'
import { MAX_WORKFLOW_RUN_DURATION_MS } from '@/lib/server/workflow/runtime-engine'
import { logger } from '@/lib/logger'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    // 1. 验证 CRON_SECRET
    const authHeader = req.headers.get('Authorization')
    const { searchParams } = new URL(req.url)
    const querySecret = searchParams.get('secret')
    const secret = process.env.CRON_SECRET || 'dev_secret'

    if (
      authHeader !== `Bearer ${secret}` &&
      querySecret !== secret
    ) {
      return ApiResponse.apiError('Unauthorized', 401, 'UNAUTHORIZED')
    }

    const timeoutThreshold = new Date(Date.now() - MAX_WORKFLOW_RUN_DURATION_MS)

    // 2. 查询所有 status='running' 且 startedAt < now - MAX_WORKFLOW_RUN_DURATION_MS 的 WorkflowRun
    const runningTimedOut = await prisma.workflowRun.findMany({
      where: {
        status: 'running',
        startedAt: {
          lt: timeoutThreshold
        }
      }
    })

    let timedOutCount = 0

    // 3. 对每一个进行熔断处理并写入审计日志
    for (const run of runningTimedOut) {
      await prisma.$transaction(async (tx) => {
        await tx.workflowRun.update({
          where: { runId: run.runId },
          data: {
            status: 'failed',
            errorMessage: 'WorkflowRun timed out by cron watchdog',
            completedAt: new Date(),
            finishedAt: new Date()
          }
        })

        // 同时把所有 pending / running step 设为 skipped/failed
        await tx.stepRun.updateMany({
          where: {
            runId: run.runId,
            status: { in: ['pending', 'running', 'waiting'] }
          },
          data: {
            status: 'failed',
            errorCode: 'TIMEOUT',
            errorMessage: 'WorkflowRun timed out by cron watchdog',
            completedAt: new Date()
          }
        })
      })

      await writeAuditLog({
        actor: 'system',
        action: 'workflow.run.timeout',
        targetType: 'workflow',
        targetId: run.workflowId,
        detail: `WorkflowRun ${run.runId} timed out by cron watchdog`,
        riskLevel: 'medium',
        workspaceId: run.workspaceId,
        contextSnapshot: { runId: run.runId, workflowId: run.workflowId }
      })

      timedOutCount++
    }

    // 写入 Cron 汇总审计日志
    await writeAuditLog({
      actor: 'system',
      action: 'cron.workflow-timeout.completed',
      targetType: 'cron',
      targetId: 'workflow-timeout',
      detail: `Workflow timeout watchdog cron execution completed. Timed out runs count: ${timedOutCount}`,
      riskLevel: 'low',
      workspaceId: 'system',
      contextSnapshot: { timedOutCount }
    })

    return ApiResponse.ok({ timedOutCount })
  } catch (err: any) {
    logger.error('CRON workflow-timeout: execution failed', {
      service: 'cron-workflow-timeout',
      action: 'cron.workflow-timeout.failed',
      traceId: undefined,
      workspaceId: 'system',
      errorCode: 'CRON_TIMEOUT_FAILED',
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined
    })
    // 柔和捕获：返回 200，不让外部 Cron 服务（如 Vercel）抛 500 告警风暴
    return NextResponse.json({
      success: false,
      error: { code: 'CRON_TIMEOUT_FAILED', message: err.message || 'Cron execution failed' }
    }, { status: 200 })
  }
}

import { ApiResponse } from '@/lib/server/api-response'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/server/audit'
import { MAX_WORKFLOW_RUN_DURATION_MS } from '@/lib/server/workflow/runtime-engine'

export async function GET(req: Request) {
  // 1. 验证 CRON_SECRET
  const authHeader = req.headers.get('Authorization')
  const { searchParams } = new URL(req.url)
  const querySecret = searchParams.get('secret')
  const secret = process.env.CRON_SECRET || 'dev_secret'

  if (
    authHeader !== `Bearer ${secret}` &&
    querySecret !== secret
  ) {
    return ApiResponse.error('Unauthorized', 401)
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
      workspaceId: run.workspaceId
    })

    timedOutCount++
  }

  return ApiResponse.ok({ timedOutCount })
}

import { ApiResponse } from '@/lib/server/api-response'; import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/server/audit'
import { MAX_WORKFLOW_RUN_DURATION_MS, DEFAULT_STEP_TIMEOUT_MS } from '@/lib/server/workflow/runtime-engine'
import { logger } from '@/lib/logger'; import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization'); const { searchParams } = new URL(req.url)
    const secret = process.env.CRON_SECRET || 'dev_secret'
    if (authHeader !== `Bearer ${secret}` && searchParams.get('secret') !== secret) return ApiResponse.apiError('Unauthorized', 401, 'UNAUTHORIZED')
    const timeoutThreshold = new Date(Date.now() - MAX_WORKFLOW_RUN_DURATION_MS)
    const runningTimedOut = await prisma.workflowRun.findMany({ where: { status: 'running', startedAt: { lt: timeoutThreshold } } })
    let timedOutCount = 0
    for (const run of runningTimedOut) {
      await prisma.$transaction(async (tx) => {
        await tx.workflowRun.update({ where: { runId: run.runId }, data: { status: 'failed', errorMessage: 'WorkflowRun timed out', completedAt: new Date(), finishedAt: new Date() } })
        await tx.stepRun.updateMany({ where: { runId: run.runId, status: { in: ['pending', 'running', 'waiting'] } }, data: { status: 'failed', errorCode: 'TIMEOUT', errorMessage: 'Timed out', completedAt: new Date() } })
      })
      void writeAuditLog({ actor: 'system', action: 'workflow.run.timeout', targetType: 'workflow', targetId: run.workflowId, detail: `WorkflowRun ${run.runId} timed out`, riskLevel: 'medium', workspaceId: run.workspaceId })
      timedOutCount++
    }
    const staleStepCutoff = new Date(Date.now() - DEFAULT_STEP_TIMEOUT_MS)
    const timedOutSteps = await prisma.stepRun.findMany({ where: { status: 'running', startedAt: { lt: staleStepCutoff } } })
    for (const step of timedOutSteps) {
      await prisma.stepRun.update({ where: { stepId: step.stepId }, data: { status: 'failed', errorCode: 'STEP_TIMEOUT', errorMessage: 'Step timed out', completedAt: new Date() } })
      void writeAuditLog({ actor: 'system', action: 'workflow.step.timeout', targetType: 'workflow', targetId: step.nodeId, detail: `Step ${step.stepId} timed out`, riskLevel: 'high', workspaceId: step.workspaceId })
    }
    void writeAuditLog({ actor: 'system', action: 'cron.workflow-timeout.completed', targetType: 'cron', targetId: 'workflow-timeout', detail: `Timeout sweep done. Runs: ${timedOutCount}, Steps: ${timedOutSteps.length}`, riskLevel: 'low', workspaceId: 'system' })
    return ApiResponse.ok({ timedOutCount, timedOutStepsCount: timedOutSteps.length })
  } catch (err: any) { logger.error('CRON workflow-timeout: failed', { error: err.message }); return NextResponse.json({ success: false, error: { code: 'CRON_TIMEOUT_FAILED', message: err.message || 'Cron execution failed' } }, { status: 200 }) }
}

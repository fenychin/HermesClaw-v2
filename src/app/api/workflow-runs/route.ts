import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { startWorkflowRun } from '@/lib/server/workflow/runtime-engine'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const POST = withRBAC(
  async (req: Request, ctx: any) => {
    let body: any = {}
    try {
      const text = await req.text()
      if (text) {
        body = JSON.parse(text)
      }
    } catch {
      // ignore
    }

    const { workflowId } = body
    if (!workflowId) {
      return ApiResponse.apiError('Missing workflowId in body', 400, 'BAD_REQUEST')
    }

    try {
      const run = await startWorkflowRun({
        workflowId,
        workspaceId: ctx.workspaceId,
        mode: body.mode,
        inputContext: body.inputContext,
        triggeredBy: ctx.userId,
        triggerType: body.triggerType || 'manual'
      })

      return ApiResponse.ok(run)
    } catch (err: any) {
      logger.error('POST /api/workflow-runs: failed', {
        service: 'api-workflow-runs',
        action: 'workflow.run.create.failed',
        traceId: undefined,
        workspaceId: ctx.workspaceId,
        errorCode: 'WORKFLOW_START_FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
        errorStack: err instanceof Error ? err.stack : undefined
      })
      return ApiResponse.apiError(err.message, 400, 'WORKFLOW_START_FAILED')
    }
  },
  'MEMBER'
)

export const GET = withRBAC(
  async (req: Request, ctx: any) => {
    try {
      const { searchParams } = new URL(req.url)
      const workflowId = searchParams.get('workflowId')

      const whereClause: any = {
        workspaceId: ctx.workspaceId
      }
      if (workflowId) {
        whereClause.workflowId = workflowId
      }

      const runs = await prisma.workflowRun.findMany({
        where: whereClause,
        orderBy: {
          createdAt: 'desc'
        }
      })

      return ApiResponse.ok(runs)
    } catch (err: any) {
      logger.error('GET /api/workflow-runs: failed', {
        service: 'api-workflow-runs',
        action: 'workflow.run.list.failed',
        traceId: undefined,
        workspaceId: ctx.workspaceId,
        errorCode: 'WORKFLOW_LIST_FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
        errorStack: err instanceof Error ? err.stack : undefined
      })
      return ApiResponse.apiError(err.message, 500, 'WORKFLOW_LIST_FAILED')
    }
  },
  'MEMBER'
)

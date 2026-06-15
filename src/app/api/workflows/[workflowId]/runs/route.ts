import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { startWorkflowRun } from '@/lib/server/workflow/runtime-engine'
import { prisma } from '@/lib/prisma'

export const POST = withRBAC(
  async (req: Request, ctx: any, routeCtx: any) => {
    const { workflowId } = await routeCtx.params

    let body: any = {}
    try {
      const text = await req.text()
      if (text) {
        body = JSON.parse(text)
      }
    } catch {
      // ignore
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
      return ApiResponse.error(err.message, 400)
    }
  },
  'MEMBER'
)

export const GET = withRBAC(
  async (req: Request, ctx: any, routeCtx: any) => {
    const { workflowId } = await routeCtx.params

    const runs = await prisma.workflowRun.findMany({
      where: {
        workflowId,
        workspaceId: ctx.workspaceId
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return ApiResponse.ok(runs)
  },
  'MEMBER'
)

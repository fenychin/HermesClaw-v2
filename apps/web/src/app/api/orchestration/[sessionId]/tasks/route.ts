import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { prisma } from '@/lib/prisma'

export const GET = withRBAC(
  async (req: Request, ctx: any, routeCtx: any) => {
    const { sessionId } = await routeCtx.params

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    const whereClause: any = {
      sessionId,
      workspaceId: ctx.workspaceId
    }
    if (status) {
      whereClause.status = status
    }

    const tasks = await prisma.subAgentTask.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'asc'
      }
    })

    return ApiResponse.ok(tasks)
  },
  'MEMBER'
)

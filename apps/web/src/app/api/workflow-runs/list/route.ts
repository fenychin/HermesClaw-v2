import { prisma } from "@/lib/prisma"
import { withRBAC } from "@/lib/server/api-handler"
import { ApiResponse } from "@/lib/server/api-response"

export const GET = withRBAC(async (req, ctx) => {
  try {
    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get("limit") || "20", 10)

    const runs = await prisma.workflowRun.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: {
        workflow: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: limit
    })

    const formatted = runs.map(r => ({
      id: r.id,
      runId: r.runId,
      status: r.status,
      triggeredBy: r.triggeredBy,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
      durationMs: r.durationMs,
      workflowName: r.workflow?.name || "未知工作流"
    }))

    return ApiResponse.ok({ runs: formatted })
  } catch (error) {
    return ApiResponse.apiError("获取运行历史失败", 500)
  }
}, "VIEWER")

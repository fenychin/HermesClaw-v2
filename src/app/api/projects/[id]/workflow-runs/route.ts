import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"

/** GET /api/projects/[id]/workflow-runs —— 获取当前项目下的 Workflow 运行历史 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "20", 10)

    const existing = await prisma.project.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    })

    if (!existing) {
      return errorResponse("项目不存在", 404)
    }

    const workflowRuns = await prisma.workflowRun.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        OR: [
          { inputContext: { path: "$.projectId", equals: id } },
          { input: { contains: id } }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    const serialized = workflowRuns.map((r) => ({
      id: r.id,
      runId: r.runId,
      status: r.status,
      mode: r.mode,
      triggeredBy: r.triggeredBy,
      triggerType: r.triggerType,
      createdAt: r.createdAt.toISOString(),
      startedAt: r.startedAt ? r.startedAt.toISOString() : null,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      durationMs: r.durationMs,
      errorMessage: r.errorMessage,
    }))

    return successResponse({ workflowRuns: serialized })
  } catch (error) {
    logger.error('GET /api/projects/[id]/workflow-runs: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

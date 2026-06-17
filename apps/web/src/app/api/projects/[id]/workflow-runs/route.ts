import { prisma } from "@/lib/prisma"; import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"; import { buildWorkspaceContext } from "@/lib/workspace"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const ctx = await buildWorkspaceContext(request)
    const limit = parseInt(new URL(request.url).searchParams.get("limit") || "20", 10)
    const existing = await prisma.project.findFirst({ where: { id, workspaceId: ctx.workspaceId } })
    if (!existing) return errorResponse("项目不存在", 404)
    const runs = await prisma.workflowRun.findMany({ where: { workspaceId: ctx.workspaceId, OR: [{ inputContext: { path: "$.projectId", equals: id } }, { input: { contains: id } }] }, orderBy: { createdAt: "desc" }, take: limit })
    return successResponse({ workflowRuns: runs.map((r: any) => ({ id: r.id, runId: r.runId, status: r.status, mode: r.mode, triggeredBy: r.triggeredBy, triggerType: r.triggerType, createdAt: r.createdAt.toISOString(), startedAt: r.startedAt?.toISOString() ?? null, completedAt: r.completedAt?.toISOString() ?? null, durationMs: r.durationMs, errorMessage: r.errorMessage })) })
  } catch (error) { logger.error('GET /api/projects/[id]/workflow-runs: 失败'); return errorResponse("服务器内部错误") }
}

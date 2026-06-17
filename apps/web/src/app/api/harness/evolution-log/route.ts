import { prisma } from "@/lib/prisma"; import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"; import { buildWorkspaceContext } from "@/lib/workspace"
export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const limitParam = Number(new URL(request.url).searchParams.get("limit"))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50
    const logs = await prisma.evolutionLog.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" }, take: limit })
    return successResponse({ logs: logs.map((log: any) => ({ ...log, evaluatedAt: log.evaluatedAt.toISOString(), createdAt: log.createdAt.toISOString() })) })
  } catch (error) { logger.error('GET /api/harness/evolution-log: 失败'); return errorResponse("服务器内部错误") }
}

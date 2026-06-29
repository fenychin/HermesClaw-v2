/** 市场情报路由 —— 提供行业动态、关税风险等市场情报数据（PRD §9.2 基础版，MVP 范围内）。 */
import { prisma } from "@/lib/prisma"; import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"; import type { WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const url = new URL(request.url)
    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }
    const impactLevel = url.searchParams.get("impactLevel"); if (impactLevel) where.impactLevel = impactLevel
    const type = url.searchParams.get("type"); if (type) where.type = type
    const intelligence = await prisma.marketIntelligence.findMany({ where, orderBy: { publishedAt: "desc" } })
    return successResponse({ intelligence: intelligence.map((i: any) => ({ ...i, publishedAt: i.publishedAt.toISOString(), createdAt: i.createdAt.toISOString() })) })
  } catch (error) { logger.error('GET /api/intelligence: 失败'); return errorResponse("服务器内部错误") }
}, "VIEWER")

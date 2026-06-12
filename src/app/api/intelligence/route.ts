import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"
import type { WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"

/** 序列化 MarketIntelligence，将 DateTime 转为 ISO 字符串 */
function serializeIntelligence(intel: {
  publishedAt: Date
  createdAt: Date
} & Record<string, unknown>) {
  return {
    ...intel,
    publishedAt: intel.publishedAt.toISOString(),
    createdAt: intel.createdAt.toISOString(),
  }
}

/** GET /api/intelligence —— 获取市场情报列表（按发布时间倒序）
 * —— 查询参数：impactLevel（high/mid/low）、type（currency|tariff|competitor|market|logistics）
 * —— RBAC: VIEWER（与 stats/activity-feed 保持一致）
 * —— ALWAYS 包含 workspaceId（AGENTS.md §4.11）
 */
export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const url = new URL(request.url)
    const impactLevel = url.searchParams.get("impactLevel") || undefined
    const type = url.searchParams.get("type") || undefined

    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }
    if (impactLevel) where.impactLevel = impactLevel
    if (type) where.type = type

    const intelligence = await prisma.marketIntelligence.findMany({
      where,
      orderBy: { publishedAt: "desc" },
    })
    return successResponse({ intelligence: intelligence.map(serializeIntelligence) })
  } catch (error) {
    logger.error('GET /api/intelligence: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}, "VIEWER")

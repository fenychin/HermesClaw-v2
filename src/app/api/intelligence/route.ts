import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"

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
 * —— 查询参数：impactLevel（high/mid/low），可选按影响力等级筛选
 * —— ALWAYS 包含 workspaceId（AGENTS.md §4.11）
 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const url = new URL(request.url)
    const impactLevel = url.searchParams.get("impactLevel") || undefined

    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }
    if (impactLevel) where.impactLevel = impactLevel

    const intelligence = await prisma.marketIntelligence.findMany({
      where,
      orderBy: { publishedAt: "desc" },
    })
    return successResponse({ intelligence: intelligence.map(serializeIntelligence) })
  } catch (error) {
    logger.error('GET /api/intelligence: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

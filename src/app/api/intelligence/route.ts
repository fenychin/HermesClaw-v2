import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"

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

/** GET /api/intelligence —— 获取市场情报列表（按发布时间倒序） */
export async function GET() {
  try {
    const intelligence = await prisma.marketIntelligence.findMany({
      orderBy: { publishedAt: "desc" },
    })
    return successResponse({ intelligence: intelligence.map(serializeIntelligence) })
  } catch (error) {
    logger.error('GET /api/intelligence: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

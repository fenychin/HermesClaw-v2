import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"

/** 序列化 Quotation，将 DateTime 转为 ISO 字符串 */
function serializeQuotation(quotation: {
  createdAt: Date
} & Record<string, unknown>) {
  return {
    ...quotation,
    createdAt: quotation.createdAt.toISOString(),
  }
}

/** GET /api/quotations —— 获取报价列表（按创建时间倒序） */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const quotations = await prisma.quotation.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
    })
    return successResponse({ quotations: quotations.map(serializeQuotation) })
  } catch (error) {
    logger.error('GET /api/quotations: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

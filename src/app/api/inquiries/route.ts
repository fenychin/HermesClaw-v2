import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"

/** 序列化 Inquiry，将 DateTime 转为 ISO 字符串（匹配 types/trade.ts） */
function serializeInquiry(inquiry: {
  receivedAt: Date
  createdAt: Date
} & Record<string, unknown>) {
  return {
    ...inquiry,
    receivedAt: inquiry.receivedAt.toISOString(),
    createdAt: inquiry.createdAt.toISOString(),
  }
}

/** GET /api/inquiries —— 获取询盘列表（按接收时间倒序） */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const inquiries = await prisma.inquiry.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { receivedAt: "desc" },
    })
    return successResponse({ inquiries: inquiries.map(serializeInquiry) })
  } catch (error) {
    logger.error('GET /api/inquiries: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

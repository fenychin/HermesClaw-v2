import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  successResponse,
  errorResponse,
} from "@/lib/api-utils"

/** GET /api/conversations/[id] —— 获取对话详情（含消息列表） */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    })

    if (!conversation) {
      return errorResponse("对话不存在", 404)
    }

    return successResponse({ conversation })
  } catch (error) {
    logger.error('GET /api/conversations/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** DELETE /api/conversations/[id] —— 删除对话（级联删除消息） */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const existing = await prisma.conversation.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse("对话不存在", 404)
    }

    // 先删除关联消息，再删除对话
    await prisma.conversationMessage.deleteMany({
      where: { conversationId: id },
    })
    await prisma.conversation.delete({ where: { id } })

    return successResponse({ message: "对话已删除" })
  } catch (error) {
    logger.error('DELETE /api/conversations/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

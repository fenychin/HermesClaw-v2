import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { ConversationMessageSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext } from "@/lib/workspace"

/** POST /api/conversations/[id]/messages —— 向对话追加消息 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversationId } = await params
    const ctx = await buildWorkspaceContext(request)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, ConversationMessageSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    // 验证对话存在
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    })

    if (!conversation) {
      return errorResponse("对话不存在", 404)
    }

    const message = await prisma.conversationMessage.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId: ctx.workspaceId,
        conversationId,
        role: body.role,
        content: body.content,
      },
    })

    // 自动更新对话的 updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    return successResponse({ message }, 201)
  } catch (error) {
    logger.error('POST /api/conversations/[id]/messages: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

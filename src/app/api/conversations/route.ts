import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { ConversationCreateSchema, validateBody } from "@/lib/validators"

/** GET /api/conversations —— 获取对话列表 */
export async function GET() {
  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { messages: true } },
      },
    })

    return successResponse({ conversations })
  } catch (error) {
    logger.error('GET /api/conversations: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** POST /api/conversations —— 创建新对话 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, ConversationCreateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const conversation = await prisma.conversation.create({
      data: {
        id: crypto.randomUUID(),
        title: body.title,
        projectId: body.projectId,
        messages: body.initialMessage
          ? {
              create: {
                id: crypto.randomUUID(),
                role: "user",
                content: body.initialMessage,
              },
            }
          : undefined,
      },
      include: {
        _count: { select: { messages: true } },
      },
    })

    return successResponse({ conversation }, 201)
  } catch (error) {
    logger.error('POST /api/conversations: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { ConversationMessageSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"
import { actorFromSession } from "@/lib/server/audit"
import { auditedWrite } from "@/lib/server/audited-write"

/** POST /api/conversations/[id]/messages —— 向对话追加消息 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversationId } = await params
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, ConversationMessageSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    // 验证对话存在（带 workspaceId 隔离，AGENTS.md §4.11）
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId: ctx.workspaceId },
    })

    if (!conversation) {
      return errorResponse("对话不存在", 404)
    }

    // 预记录审计 + 写库 + 回填，统一经 auditedWrite（AGENTS.md §4.3 / §5 #3）
    const messageId = crypto.randomUUID()
    const actor = await actorFromSession()
    const message = await auditedWrite(
      {
        actor,
        action: "conversation.message",
        targetType: "conversation",
        targetId: conversationId,
        riskLevel: "low",
        automationLevel: "L2",
        triggeredBy: "user",
        workspaceId: ctx.workspaceId,
        detail: `追加消息(${body.role})至对话 ${conversationId}`,
      },
      async () => {
        const created = await prisma.conversationMessage.create({
          data: {
            id: messageId,
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
        return created
      },
    )

    return successResponse({ message }, 201)
  } catch (error) {
    // 权限不足（VIEWER 写）：返回 403
    if (error instanceof ForbiddenError) {
      return errorResponse(error.message, 403)
    }
    logger.error('POST /api/conversations/[id]/messages: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

import { prisma } from "@/lib/prisma"; import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { ConversationMessageSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"
import { actorFromSession } from "@/lib/server/audit"; import { auditedWrite } from "@/lib/server/audited-write"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: conversationId } = await params; const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role)
    const rawBody = await request.json(); const parsed = validateBody(rawBody, ConversationMessageSchema); if (parsed instanceof Response) return parsed; const body = parsed
    const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId: ctx.workspaceId } })
    if (!conversation) return errorResponse("对话不存在", 404)
    const messageId = crypto.randomUUID(); const actor = await actorFromSession()
    const message = await auditedWrite({ actor, action: "conversation.message", targetType: "conversation", targetId: conversationId, riskLevel: "low", automationLevel: "L2", triggeredBy: "user", workspaceId: ctx.workspaceId, detail: `追加消息至对话 ${conversationId}` }, async () => {
      const created = await prisma.conversationMessage.create({ data: { id: messageId, workspaceId: ctx.workspaceId, conversationId, role: body.role, content: body.content } })
      if (body.trace) try { await prisma.reasoningTrace.create({ data: { traceId: body.trace.traceId, conversationId, messageId, workspaceId: ctx.workspaceId, steps: body.trace.steps, totalDurationMs: body.trace.totalDurationMs || null } }) } catch {}
      await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }); return created
    })
    return successResponse({ message }, 201)
  } catch (error) { if (error instanceof ForbiddenError) return errorResponse(error.message, 403); logger.error('POST /api/conversations/[id]/messages: 失败'); return errorResponse("服务器内部错误") }
}

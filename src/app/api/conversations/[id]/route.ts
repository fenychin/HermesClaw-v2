import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"
import { actorFromSession } from "@/lib/server/audit"
import { auditedWrite } from "@/lib/server/audited-write"
import { writeAgentLog } from "@/lib/server/agent-log"
import { z } from "zod"
import { validateBody } from "@/lib/validators"

/** PATCH /api/conversations/[id] 请求体 schema */
const ConversationPatchSchema = z.object({
  projectId: z.string().nullable().optional(),
  title: z.string().min(1).max(200).optional(),
})

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

/** PATCH /api/conversations/[id] —— 更新对话（关联项目空间、重命名等） */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const start = Date.now()
  const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)

    const raw = await request.json()
    const parsed = validateBody(raw, ConversationPatchSchema)
    if (parsed instanceof Response) return parsed

    // workspaceId 隔离：仅允许操作当前工作空间内的对话（AGENTS.md §4.11）
    const existing = await prisma.conversation.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    })
    if (!existing) return errorResponse("对话不存在", 404)

    // 仅允许更新 projectId 和 title
    const updateData: Record<string, unknown> = {}
    if (parsed.projectId !== undefined) {
      updateData.projectId = parsed.projectId
    }
    if (parsed.title !== undefined) {
      updateData.title = parsed.title
    }

    if (Object.keys(updateData).length === 0) {
      return errorResponse("无有效更新字段", 400)
    }

    const actor = await actorFromSession()
    const conversation = await auditedWrite(
      {
        actor,
        action: "conversation.update",
        targetType: "conversation",
        targetId: id,
        riskLevel: "low",
        automationLevel: "L2",
        triggeredBy: "user",
        workspaceId: ctx.workspaceId,
        detail: `更新对话: ${id}`,
        contextSnapshot: updateData,
      },
      () =>
        prisma.conversation.update({
          where: { id },
          data: updateData,
          include: { _count: { select: { messages: true } } },
        }),
      { onSuccess: (c) => ({ detail: `对话已更新: ${c.id}` }) },
    )

    void writeAgentLog({
      source: "conversation",
      taskName: "对话更新",
      status: "success",
      duration: elapsed(),
      detail: `关联项目: ${parsed.projectId ?? "解除关联"}`,
      riskLevel: "low",
    })

    return successResponse({ conversation })
  } catch (error) {
    if (error instanceof ForbiddenError) return errorResponse(error.message, 403)
    logger.error('PATCH /api/conversations/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    void writeAgentLog({
      source: "conversation",
      taskName: "对话更新",
      status: "error",
      duration: elapsed(),
      detail: error instanceof Error ? error.message : "对话更新失败",
    })
    return errorResponse("服务器内部错误")
  }
}

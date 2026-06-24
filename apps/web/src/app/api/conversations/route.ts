export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma"; import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { ConversationCreateSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"
import { actorFromSession } from "@/lib/server/audit"; import { auditedWrite } from "@/lib/server/audited-write"
import { writeAgentLog } from "@/lib/server/agent-log"

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const conversations = await prisma.conversation.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { messages: true } } } })

    // ETag：基于记录数 + 最新 updatedAt，计算代价极低（无需序列化整个列表）
    const latestUpdatedAt = conversations[0]?.updatedAt?.toISOString() ?? "empty"
    const etag = `"${conversations.length}-${latestUpdatedAt}"`
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304 })
    }

    const res = successResponse({ conversations })
    res.headers.set("ETag", etag)
    return res
  } catch (error) { logger.error('GET /api/conversations: 失败', { error: error instanceof Error ? error.message : '未知错误' }); return errorResponse("服务器内部错误") }
}

export async function POST(request: Request) {
  const start = Date.now(); const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`
  try {
    const ctx = await buildWorkspaceContext(request); const body = requireWritable(ctx.role)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, ConversationCreateSchema)
    if (parsed instanceof Response) return parsed; const { title, projectId, initialMessage, messages } = parsed
    const conversationId = crypto.randomUUID(); const actor = await actorFromSession()
    const messagesWithId = messages?.map((m: any) => ({ id: crypto.randomUUID(), role: m.role, content: m.content, trace: m.trace }))
    const conversation = await auditedWrite({ actor, action: "conversation.create", targetType: "conversation", targetId: conversationId, riskLevel: "low", automationLevel: "L2", triggeredBy: "user", workspaceId: ctx.workspaceId, detail: `创建对话: ${title}` }, async () => {
      const created = await prisma.conversation.create({ data: { id: conversationId, workspaceId: ctx.workspaceId, title, projectId, messages: messagesWithId?.length ? { create: messagesWithId.map((m: any) => ({ id: m.id, workspaceId: ctx.workspaceId, role: m.role, content: m.content })) } : initialMessage ? { create: { id: crypto.randomUUID(), workspaceId: ctx.workspaceId, role: "user", content: initialMessage } } : undefined }, include: { _count: { select: { messages: true } } } })
      return created
    }, { onSuccess: (c: any) => ({ detail: `对话已创建: ${c.id}` }) })
    if (messagesWithId) {
      for (const m of messagesWithId) {
        if (m.trace) {
          try {
            await prisma.reasoningTrace.create({ data: { traceId: m.trace.traceId, conversationId, messageId: m.id, workspaceId: ctx.workspaceId, steps: m.trace.steps, totalDurationMs: m.trace.totalDurationMs || null } })
          } catch (traceErr) {
            logger.warn(`[conversations] 保存 reasoningTrace 失败 (非致命错误):`, traceErr)
          }
        }
      }
    }
    void writeAgentLog({ source: "conversation", taskName: "对话创建", status: "success", duration: elapsed(), detail: conversation.title, riskLevel: "low" })
    return successResponse({ conversation }, 201)
  } catch (error) { if (error instanceof ForbiddenError) return errorResponse(error.message, 403); logger.error('POST /api/conversations: 失败', { error: error instanceof Error ? error.message : error }); return errorResponse("服务器内部错误") }
}

/**
 * Conversation Mutation Service
 */
import { prisma } from "@/lib/prisma"
import { actorFromSession } from "@/lib/server/audit"
import { auditedWrite } from "@/lib/server/audited-write"
import { writeAgentLog } from "@/lib/server/agent-log"

export class ConversationMutationError extends Error {
  constructor(public readonly httpStatus: number, message: string) { super(message); this.name = "ConversationMutationError" }
}

export async function getConversation(id: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } } } })
  if (!conversation) throw new ConversationMutationError(404, "对话不存在")
  const traces = await prisma.reasoningTrace.findMany({ where: { messageId: { in: conversation.messages.map((m: any) => m.id) } } })
  const traceMap = new Map<string, any>()
  for (const t of traces) if (t.messageId) traceMap.set(t.messageId, { traceId: t.traceId, steps: typeof t.steps === 'string' ? JSON.parse(t.steps) : t.steps, totalDurationMs: t.totalDurationMs })
  return { ...conversation, messages: conversation.messages.map((m: any) => ({ ...m, trace: traceMap.get(m.id) || null })) }
}

export async function deleteConversation(id: string) {
  const existing = await prisma.conversation.findUnique({ where: { id } })
  if (!existing) throw new ConversationMutationError(404, "对话不存在")
  await prisma.conversationMessage.deleteMany({ where: { conversationId: id } })
  await prisma.conversation.delete({ where: { id } })
}

export async function patchConversation(id: string, workspaceId: string, body: { projectId?: string | null; title?: string }) {
  const existing = await prisma.conversation.findFirst({ where: { id, workspaceId } })
  if (!existing) throw new ConversationMutationError(404, "对话不存在")
  const updateData: Record<string, unknown> = {}
  if (body.projectId !== undefined) updateData.projectId = body.projectId
  if (body.title !== undefined) updateData.title = body.title
  if (Object.keys(updateData).length === 0) throw new ConversationMutationError(400, "无有效更新字段")
  const actor = await actorFromSession()
  const conversation = await auditedWrite({ actor, action: "conversation.update", targetType: "conversation", targetId: id, riskLevel: "low", automationLevel: "L2", triggeredBy: "user", workspaceId, detail: `更新对话: ${id}`, contextSnapshot: updateData }, () => prisma.conversation.update({ where: { id }, data: updateData, include: { _count: { select: { messages: true } } } }))
  void writeAgentLog({ source: "conversation", taskName: "对话更新", status: "success", duration: "0s", detail: `关联项目: ${body.projectId ?? "解除关联"}`, riskLevel: "low" })
  return conversation
}

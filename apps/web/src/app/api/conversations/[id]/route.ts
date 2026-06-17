import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"
import { z } from "zod"
import { validateBody } from "@/lib/server/validators"
import { getConversation, deleteConversation, patchConversation, ConversationMutationError } from "@/lib/server/conversation-mutations"

const ConversationPatchSchema = z.object({ projectId: z.string().nullable().optional(), title: z.string().min(1).max(200).optional() })

function handleErr(e: unknown) { if (e instanceof ConversationMutationError) return errorResponse(e.message, e.httpStatus); if (e instanceof ForbiddenError) return errorResponse(e.message, 403); return errorResponse("服务器内部错误") }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; return successResponse({ conversation: await getConversation(id) }) }
  catch (e) { return handleErr(e) }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; await deleteConversation(id); return successResponse({ message: "对话已删除" }) }
  catch (e) { return handleErr(e) }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role)
    const parsed = validateBody(await request.json(), ConversationPatchSchema); if (parsed instanceof Response) return parsed
    return successResponse({ conversation: await patchConversation(id, ctx.workspaceId, parsed) })
  } catch (e) { return handleErr(e) }
}

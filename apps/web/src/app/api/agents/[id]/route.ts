import { prisma } from "@/lib/prisma"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { AgentUpdateSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"
import { serializeAgent } from "@/lib/server/agent-serializer"
import { patchAgent, deleteAgent, AgentMutationError } from "@/lib/server/agent-mutations"

function handleErr(e: unknown) { if (e instanceof AgentMutationError) return e.response ?? errorResponse(e.message, e.httpStatus); if (e instanceof ForbiddenError) return errorResponse(e.message, 403); return errorResponse("服务器内部错误") }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const ctx = await buildWorkspaceContext(request)
    const agent = await prisma.agent.findUnique({ where: { id, workspaceId: ctx.workspaceId }, include: { runLogs: { orderBy: { createdAt: "desc" } } } })
    if (!agent) return errorResponse("智能体不存在", 404)
    return successResponse({ agent: serializeAgent(agent as any) })
  } catch { return errorResponse("服务器内部错误") }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role)
    const parsed = validateBody(await request.json(), AgentUpdateSchema); if (parsed instanceof Response) return parsed
    return successResponse({ agent: serializeAgent(await patchAgent(id, ctx.workspaceId, parsed) as any) })
  } catch (e) { return handleErr(e) }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role)
    return successResponse(await deleteAgent(id, ctx.workspaceId, request))
  } catch (e) { return handleErr(e) }
}

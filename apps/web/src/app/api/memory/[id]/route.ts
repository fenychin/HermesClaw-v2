import { prisma } from "@/lib/prisma"
import { serializeMemory, successResponse, errorResponse } from "@/lib/api-utils"
import { actorFromSession } from "@/lib/server/audit"
import { MemoryUpdateSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"
import { patchMemory, putMemory, deleteMemory, MemoryMutationError } from "@/lib/server/memory-mutations"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const memory = await prisma.memory.findUnique({ where: { id }, include: { project: true } })
    if (!memory) return errorResponse("记忆不存在", 404)
    return successResponse({ memory: serializeMemory(memory as any) })
  } catch { return errorResponse("服务器内部错误") }
}

function handleErr(e: unknown): Response { if (e instanceof MemoryMutationError) return e.response ?? errorResponse(e.message, e.httpStatus); return errorResponse("服务器内部错误") }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const parsed = validateBody(await request.json(), MemoryUpdateSchema); if (parsed instanceof Response) return parsed
    return successResponse({ memory: serializeMemory(await patchMemory(id, parsed, await actorFromSession()) as any) })
  } catch (e) { return handleErr(e) }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role)
    return successResponse({ memory: await putMemory(id, ctx.workspaceId, await request.json(), await actorFromSession()) })
  } catch (e) { return handleErr(e) }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role)
    return successResponse(await deleteMemory(id, ctx.workspaceId, request))
  } catch (e) { return handleErr(e) }
}

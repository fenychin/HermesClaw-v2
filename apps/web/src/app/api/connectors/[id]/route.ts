import { prisma } from "@/lib/prisma"
import { serializeConnector, successResponse, errorResponse } from "@/lib/api-utils"
import { ConnectorUpdateSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"
import { patchConnector, deleteConnector, ConnectorMutationError } from "@/lib/server/connector-mutations"

function handleErr(e: unknown) { if (e instanceof ConnectorMutationError) return e.response ?? errorResponse(e.message, e.httpStatus); return errorResponse("服务器内部错误") }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connector = await prisma.connector.findUnique({ where: { id } })
    if (!connector) return errorResponse("连接器不存在", 404)
    return successResponse({ connector: serializeConnector(connector as any) })
  } catch { return errorResponse("服务器内部错误") }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role)
    const parsed = validateBody(await request.json(), ConnectorUpdateSchema); if (parsed instanceof Response) return parsed
    return successResponse({ connector: serializeConnector(await patchConnector(id, ctx.workspaceId, parsed) as any) })
  } catch (e) { return handleErr(e) }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role)
    return successResponse(await deleteConnector(id, ctx.workspaceId, request))
  } catch (e) { return handleErr(e) }
}

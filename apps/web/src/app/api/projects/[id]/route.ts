import { prisma } from "@/lib/prisma"
import { serializeProject, successResponse, errorResponse } from "@/lib/api-utils"
import { z } from "zod"
import { validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"
import { patchProject, deleteProject, ProjectMutationError } from "@/lib/server/project-mutations"

const ProjectPatchSchema = z.object({ name: z.string().optional(), type: z.string().optional(), status: z.string().optional(), owner: z.string().optional(), relatedClient: z.string().nullable().optional(), country: z.string().nullable().optional(), productLine: z.string().nullable().optional(), activeAgents: z.array(z.string()).optional(), riskPoints: z.array(z.string()).optional(), nextActions: z.array(z.string()).optional(), tags: z.array(z.string()).optional() })

function handleErr(e: unknown) { if (e instanceof ProjectMutationError) return errorResponse(e.message, e.httpStatus); if (e instanceof ForbiddenError) return errorResponse(e.message, 403); return errorResponse("服务器内部错误") }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await buildWorkspaceContext(request); const { id } = await params
    const project = await prisma.project.findUnique({ where: { id, workspaceId: ctx.workspaceId } })
    if (!project) return errorResponse("项目不存在", 404)
    return successResponse({ project: serializeProject(project) })
  } catch { return errorResponse("服务器内部错误") }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role); const { id } = await params
    const parsed = validateBody(await request.json(), ProjectPatchSchema); if (parsed instanceof Response) return parsed
    return successResponse({ project: serializeProject(await patchProject(id, ctx.workspaceId, parsed)) })
  } catch (e) { return handleErr(e) }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role); const { id } = await params
    return successResponse(await deleteProject(id, ctx.workspaceId))
  } catch (e) { return handleErr(e) }
}

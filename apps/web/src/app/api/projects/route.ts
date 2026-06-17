import { successResponse, errorResponse } from "@/lib/api-utils"
import { ProjectCreateSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"
import { actorFromSession } from "@/lib/server/audit"
import { listProjects, createProject } from "@/lib/server/project-service"

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request); const sp = new URL(request.url).searchParams
    return successResponse(await listProjects(ctx.workspaceId, sp.get("status") || "active", parseInt(sp.get("page") || "1", 10), parseInt(sp.get("limit") || "20", 10)))
  } catch { return errorResponse("服务器内部错误") }
}

export async function POST(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role)
    const actor = await actorFromSession(); const rawBody = await request.json()
    if (!rawBody.type) rawBody.type = "product-line"; if (!rawBody.owner) rawBody.owner = actor || "admin@hermesclaw.ai"
    if (rawBody.description !== undefined && !rawBody.productLine) rawBody.productLine = rawBody.description
    const parsed = validateBody(rawBody, ProjectCreateSchema); if (parsed instanceof Response) return parsed
    const project = await createProject(ctx.workspaceId, parsed, actor)
    return successResponse({ project: { id: project.id, name: project.name, status: project.status, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() } }, 201)
  } catch (e) { if (e instanceof ForbiddenError) return errorResponse(e.message, 403); return errorResponse("服务器内部错误") }
}

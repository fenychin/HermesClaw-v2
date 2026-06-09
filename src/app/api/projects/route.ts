import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  parseJsonField,
  stringifyJsonField,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { ProjectCreateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext } from "@/lib/workspace"

/** 序列化 Project，将 JSON 字符串字段反序列化 */
function serializeProject(project: Record<string, unknown>) {
  return {
    ...project,
    activeAgents: parseJsonField(project.activeAgents as string, []),
    riskPoints: parseJsonField(project.riskPoints as string, []),
    nextActions: parseJsonField(project.nextActions as string, []),
    tags: parseJsonField(project.tags as string, []),
  }
}

/** GET /api/projects —— 获取当前 workspace 的项目列表 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const projects = await prisma.project.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { memories: true } },
      },
    })

    return successResponse({
      projects: projects.map((p) => serializeProject(p as unknown as Record<string, unknown>)),
    })
  } catch (error) {
    logger.error('GET /api/projects: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** POST /api/projects —— 创建新项目 */
export async function POST(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, ProjectCreateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const project = await prisma.project.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId: ctx.workspaceId,
        name: body.name,
        type: body.type,
        status: body.status,
        owner: body.owner,
        relatedClient: body.relatedClient,
        country: body.country,
        productLine: body.productLine,
        activeAgents: stringifyJsonField(body.activeAgents),
        riskPoints: stringifyJsonField(body.riskPoints),
        nextActions: stringifyJsonField(body.nextActions),
        tags: stringifyJsonField(body.tags),
      },
    })

    return successResponse(
      { project: serializeProject(project as unknown as Record<string, unknown>) },
      201,
    )
  } catch (error) {
    logger.error('POST /api/projects: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

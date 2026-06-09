import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  parseJsonField,
  stringifyJsonField,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { writeAuditLog } from "@/lib/server/audit"
import { checkConfirmQuery } from "@/lib/server/guardrail"
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

/** GET /api/projects/[id] —— 获取项目详情（含关联记忆） */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        memories: { orderBy: { createdAt: "desc" } },
        _count: { select: { memories: true } },
      },
    })

    if (!project) {
      return errorResponse("项目不存在", 404)
    }

    return successResponse({
      project: serializeProject(project as unknown as Record<string, unknown>),
    })
  } catch (error) {
    logger.error('GET /api/projects/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** PATCH /api/projects/[id] —— 更新项目 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await prisma.project.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse("项目不存在", 404)
    }

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = body.name
    if (body.type !== undefined) data.type = body.type
    if (body.status !== undefined) data.status = body.status
    if (body.owner !== undefined) data.owner = body.owner
    if (body.relatedClient !== undefined) data.relatedClient = body.relatedClient
    if (body.country !== undefined) data.country = body.country
    if (body.productLine !== undefined) data.productLine = body.productLine
    if (body.activeAgents !== undefined) data.activeAgents = stringifyJsonField(body.activeAgents)
    if (body.riskPoints !== undefined) data.riskPoints = stringifyJsonField(body.riskPoints)
    if (body.nextActions !== undefined) data.nextActions = stringifyJsonField(body.nextActions)
    if (body.tags !== undefined) data.tags = stringifyJsonField(body.tags)

    const project = await prisma.project.update({
      where: { id },
      data,
    })

    return successResponse({
      project: serializeProject(project as unknown as Record<string, unknown>),
    })
  } catch (error) {
    logger.error('PATCH /api/projects/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** DELETE /api/projects/[id] —— 删除项目（高危，需 ?confirm=true） */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)

    const existing = await prisma.project.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse("项目不存在", 404)
    }

    const guard = await checkConfirmQuery(request, "删除项目需二次确认")
    if (!guard.ok) return guard.response

    // 解除关联记忆的 project 外键
    await prisma.memory.updateMany({
      where: { projectId: id },
      data: { projectId: null },
    })
    await prisma.project.delete({ where: { id } })

    await writeAuditLog({
      actor: guard.actor,
      action: "delete.project",
      targetType: "project",
      targetId: id,
      detail: existing.name,
      riskLevel: "high",
      workspaceId: ctx.workspaceId,
    })

    return successResponse({ message: "项目已删除" })
  } catch (error) {
    logger.error('DELETE /api/projects/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

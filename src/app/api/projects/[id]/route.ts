import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  stringifyJsonField,
  serializeProject,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { checkConfirmQuery } from "@/lib/server/guardrail"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"

/** GET /api/projects/[id] —— 获取项目详情（含关联记忆，workspaceId 隔离） */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    // 内联 RBAC：获取 workspace 上下文用于数据隔离（AGENTS.md §4.11）
    const ctx = await buildWorkspaceContext(_request)

    const project = await prisma.project.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
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

/** PATCH /api/projects/[id] —— 更新项目（RBAC + 审计 + workspaceId 隔离） */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)

    const body = await request.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return errorResponse("请求体必须为 JSON 对象", 400)
    }

    const existing = await prisma.project.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    })
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
      where: { id, workspaceId: ctx.workspaceId },
      data,
    })

    // 写操作审计（AGENTS.md §5 #3 禁止静默执行）
    const actor = await actorFromSession()
    await writeAuditLog({
      actor,
      action: "project.update",
      targetType: "project",
      targetId: id,
      detail: `更新项目: ${existing.name}`,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
    })

    return successResponse({
      project: serializeProject(project as unknown as Record<string, unknown>),
    })
  } catch (error) {
    logger.error('PATCH /api/projects/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    if (error instanceof ForbiddenError) {
      return errorResponse("权限不足，需要成员以上角色", 403)
    }
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
    requireWritable(ctx.role)

    const existing = await prisma.project.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    })
    if (!existing) {
      return errorResponse("项目不存在", 404)
    }

    const guard = await checkConfirmQuery(request, "删除项目需二次确认")
    if (!guard.ok) return guard.response

    // 解除关联记忆的 project 外键（workspaceId 隔离）
    await prisma.memory.updateMany({
      where: { projectId: id, workspaceId: ctx.workspaceId },
      data: { projectId: null },
    })
    await prisma.project.delete({
      where: { id, workspaceId: ctx.workspaceId },
    })

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
    if (error instanceof ForbiddenError) {
      return errorResponse("权限不足，需要成员以上角色", 403)
    }
    return errorResponse("服务器内部错误")
  }
}

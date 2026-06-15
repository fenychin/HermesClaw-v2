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
import { z } from "zod"
import { validateBody } from "@/lib/server/validators"

/** PATCH /api/projects/[id] 请求体 schema（全部字段可选） */
const ProjectPatchSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  owner: z.string().optional(),
  relatedClient: z.string().optional(),
  country: z.string().optional(),
  productLine: z.string().optional(),
  activeAgents: z.unknown().optional(),
  riskPoints: z.unknown().optional(),
  nextActions: z.unknown().optional(),
  tags: z.unknown().optional(),
})

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
    })

    if (!project) {
      return errorResponse("项目不存在", 404)
    }

    // 1. 查找项目级 Memory (最近 5 条活跃的)
    const memories = await prisma.memory.findMany({
      where: {
        projectId: id,
        workspaceId: ctx.workspaceId,
        status: "active",
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    })

    const serializedMemories = memories.map((m) => {
      const parsedTags = (() => {
        try {
          return JSON.parse(m.tags || "[]")
        } catch {
          return []
        }
      })()
      return {
        id: m.id,
        workspaceId: m.workspaceId,
        projectId: m.projectId,
        type: m.type,
        content: m.content.length > 200 ? m.content.substring(0, 200) + "..." : m.content,
        rawContent: m.content,
        summary: m.summary,
        source: m.source,
        tags: parsedTags,
        version: m.version,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      }
    })

    // 2. 查找关联的工作流运行 WorkflowRun (最近 10 条)
    const workflowRuns = await prisma.workflowRun.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        OR: [
          { inputContext: { path: "$.projectId", equals: id } },
          { input: { contains: id } }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    })

    const serializedProject = serializeProject(project as unknown as Record<string, unknown>)

    return successResponse({
      project: {
        ...serializedProject,
        description: project.productLine || "",
      },
      memories: serializedMemories,
      workflowRuns: workflowRuns.map((r) => ({
        id: r.id,
        runId: r.runId,
        status: r.status,
        mode: r.mode,
        createdAt: r.createdAt.toISOString(),
        startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        durationMs: r.durationMs,
        errorMessage: r.errorMessage,
      })),
    })
  } catch (error) {
    logger.error('GET /api/projects/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** PUT /api/projects/[id] —— 更新项目信息 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)

    const rawBody = await request.json()

    const existing = await prisma.project.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    })
    if (!existing) {
      return errorResponse("项目不存在", 404)
    }

    const data: Record<string, unknown> = {}
    if (rawBody.name !== undefined) data.name = rawBody.name
    if (rawBody.description !== undefined) data.productLine = rawBody.description
    if (rawBody.status !== undefined) data.status = rawBody.status

    const project = await prisma.project.update({
      where: { id, workspaceId: ctx.workspaceId },
      data,
    })

    // 写入 project.updated 审计日志
    const actor = await actorFromSession()
    await writeAuditLog({
      actor,
      action: "project.updated",
      targetType: "project",
      targetId: id,
      detail: `更新项目空间: ${existing.name} -> ${project.name}`,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
    }).catch(() => {})

    return successResponse({
      project: {
        ...serializeProject(project as unknown as Record<string, unknown>),
        description: project.productLine || "",
      }
    })
  } catch (error) {
    logger.error('PUT /api/projects/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    if (error instanceof ForbiddenError) {
      return errorResponse("权限不足，需要成员以上角色", 403)
    }
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

    const raw = await request.json()
    const body = validateBody(raw, ProjectPatchSchema)
    if (body instanceof Response) return body

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
      action: "project.updated",
      targetType: "project",
      targetId: id,
      detail: `更新项目: ${existing.name}`,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
    }).catch(() => {})

    return successResponse({
      project: {
        ...serializeProject(project as unknown as Record<string, unknown>),
        description: project.productLine || "",
      },
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

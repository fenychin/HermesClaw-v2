import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  stringifyJsonField,
  serializeProject,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { ProjectCreateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"
import { auditedWrite } from "@/lib/server/audited-write"
import { actorFromSession } from "@/lib/server/audit"

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

/** POST /api/projects —— 创建新项目（含审计 + 中期记忆初始化） */
export async function POST(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, ProjectCreateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const actor = await actorFromSession()
    const projectId = crypto.randomUUID()

    // 使用 auditedWrite 收敛预记录+执行+回填样板（AGENTS.md §4.3 / §5 #3）
    const project = await auditedWrite(
      {
        actor,
        action: "project.create",
        targetType: "project",
        targetId: projectId,
        detail: `创建项目空间: ${body.name}`,
        riskLevel: "low",
        workspaceId: ctx.workspaceId,
        automationLevel: "L2",
        triggeredBy: "user",
        contextSnapshot: {
          name: body.name,
          type: body.type,
          status: body.status,
          relatedClient: body.relatedClient ?? null,
          country: body.country ?? null,
          productLine: body.productLine ?? null,
          step: "project-create",
        },
      },
      () =>
        prisma.project.create({
          data: {
            id: projectId,
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
        }),
    )

    // 初始化项目空间的中期记忆（PRD §10.5：空间独立中期记忆）
    try {
      await prisma.memory.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: ctx.workspaceId,
          type: "mid",
          content: `项目空间「${body.name}」创建于 ${new Date().toISOString()}。初始上下文：类型=${body.type}，客户=${body.relatedClient ?? "未指定"}，国家=${body.country ?? "未指定"}，产品线=${body.productLine ?? "未指定"}。`,
          summary: `项目空间 ${body.name} 初始化中期记忆`,
          source: "project.create",
          relatedProject: body.name,
          projectId: projectId,
          confidence: 1.0,
          tags: stringifyJsonField(["project-init", body.type]),
        },
      })
    } catch (memError) {
      // 记忆初始化失败不阻断项目创建，但记录错误日志
      logger.error("POST /api/projects: 中期记忆初始化失败", {
        error: memError instanceof Error ? memError.message : "未知错误",
        projectId,
      })
    }

    return successResponse(
      { project: serializeProject(project as unknown as Record<string, unknown>) },
      201,
    )
  } catch (error) {
    logger.error('POST /api/projects: 失败', { error: error instanceof Error ? error.message : '未知错误' })

    // 错误分类：ForbiddenError → 403
    if (error instanceof ForbiddenError) {
      return errorResponse("权限不足，需要成员以上角色", 403)
    }

    return errorResponse("服务器内部错误")
  }
}

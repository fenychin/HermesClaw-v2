import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  stringifyJsonField,
  serializeProject,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { ProjectCreateSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"
import { auditedWrite } from "@/lib/server/audited-write"
import { actorFromSession } from "@/lib/server/audit"

/** GET /api/projects —— 获取当前 workspace 的项目列表 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || "active"
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "20", 10)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      workspaceId: ctx.workspaceId,
    }
    
    // 如果 status 是 active 或者是 archived，则过滤该状态。物理数据库 status 有 active, archived, completed。
    if (status) {
      where.status = status
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.project.count({ where })
    ])

    // 一次性获取当前 workspace 的最近 runs，在内存中进行匹配和计数，避免 N+1 查询导致 SQLite 锁死或卡顿
    const runs = await prisma.workflowRun.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: {
        inputContext: true,
        input: true,
        createdAt: true,
      }
    })

    // 为列表项动态计算关联项
    const processedProjects = projects.map((project) => {
      let workflowRunCount = 0
      let lastRunTime = project.updatedAt.getTime()

      for (const run of runs) {
        let isMatch = false
        // 匹配 inputContext
        try {
          const ctxObj = (typeof run.inputContext === 'string' 
            ? JSON.parse(run.inputContext) 
            : run.inputContext) as Record<string, unknown>
          if (ctxObj && ctxObj.projectId === project.id) {
            isMatch = true
          }
        } catch {}

        // 匹配 input 模糊包含
        if (!isMatch && run.input && run.input.includes(project.id)) {
          isMatch = true
        }

        if (isMatch) {
          workflowRunCount++
          const t = run.createdAt.getTime()
          if (t > lastRunTime) {
            lastRunTime = t
          }
        }
      }

      const lastActivityAt = new Date(lastRunTime).toISOString()

      // 3. 计算成员数 (activeAgents 解析后的长度 + 1)
      const agentsCount = (() => {
        try {
          const parsed = JSON.parse(project.activeAgents || "[]")
          return Array.isArray(parsed) ? parsed.length : 0
        } catch {
          return 0
        }
      })()
      const memberCount = agentsCount + 1

      const parsedTags = (() => {
        try {
          return JSON.parse(project.tags || "[]")
        } catch {
          return []
        }
      })()

      return {
        id: project.id,
        name: project.name,
        description: project.productLine || "",
        productLine: project.productLine || "",
        status: project.status,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        memberCount,
        workflowRunCount,
        lastActivityAt,
        tags: parsedTags,
        owner: project.owner,
        country: project.country,
        relatedClient: project.relatedClient,
      }
    })

    return successResponse({
      projects: processedProjects,
      total,
      page,
      limit,
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
    const actor = await actorFromSession()

    // 自适应补充 Zod 强校验要求的 type & owner
    if (!rawBody.type) {
      rawBody.type = "product-line" // 物理可选：customer | order | exhibition | product-line
    }
    if (!rawBody.owner) {
      rawBody.owner = actor || "admin@hermesclaw.ai"
    }
    if (rawBody.description !== undefined && !rawBody.productLine) {
      rawBody.productLine = rawBody.description
    }
    if (rawBody.industryId && (!rawBody.tags || rawBody.tags.length === 0)) {
      rawBody.tags = [rawBody.industryId]
    }

    const parsed = validateBody(rawBody, ProjectCreateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const projectId = crypto.randomUUID()

    // 使用 auditedWrite 收敛预记录+执行+回填样板（AGENTS.md §4.3 / §5 #3）
    const project = await auditedWrite(
      {
        actor,
        action: "project.created", // 修改为 project.created 审计
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
      {
        project: {
          id: project.id,
          name: project.name,
          description: project.productLine || "",
          status: project.status,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
          owner: project.owner,
          tags: body.tags,
        }
      },
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

import { prisma } from "@/lib/prisma"
import { serializeProject, successResponse, errorResponse } from "@/lib/api-utils"
import { z } from "zod"
import { validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"
import { patchProject, deleteProject, ProjectMutationError } from "@/lib/server/project-mutations"
import { logger } from "@/lib/logger"

const ProjectPatchSchema = z.object({ name: z.string().optional(), type: z.string().optional(), status: z.string().optional(), owner: z.string().optional(), relatedClient: z.string().nullable().optional(), country: z.string().nullable().optional(), productLine: z.string().nullable().optional(), activeAgents: z.array(z.string()).optional(), riskPoints: z.array(z.string()).optional(), nextActions: z.array(z.string()).optional(), tags: z.array(z.string()).optional() })

function handleErr(e: unknown) { if (e instanceof ProjectMutationError) return errorResponse(e.message, e.httpStatus); if (e instanceof ForbiddenError) return errorResponse(e.message, 403); return errorResponse("服务器内部错误") }

/** 从 envelopeSnapshot 提取自动化等级和风险等级。
 *  snapshot 缺失时返回 null——不捏造默认值，前端自行处理"未知"展示。 */
function extractRiskMeta(run: any): { automationLevel: string | null; riskLevel: string | null } {
  try {
    const snapshot = typeof run.envelopeSnapshot === "string"
      ? JSON.parse(run.envelopeSnapshot)
      : run.envelopeSnapshot
    if (snapshot?.automationLevel) {
      return {
        automationLevel: snapshot.automationLevel,
        riskLevel: snapshot.riskLevel ?? null,
      }
    }
  } catch {}
  return { automationLevel: null, riskLevel: null }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await buildWorkspaceContext(request); const { id } = await params
    const project = await prisma.project.findUnique({ where: { id, workspaceId: ctx.workspaceId } })
    if (!project) return errorResponse("项目不存在", 404)

    // 并行获取：中期记忆 + 关联工作流运行
    const [memories, workflowRuns] = await Promise.all([
      prisma.memory.findMany({
        where: { workspaceId: ctx.workspaceId, projectId: id, status: "active" },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, content: true, summary: true, type: true, tags: true, version: true, updatedAt: true },
      }),
      prisma.workflowRun.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          OR: [
            // 通过 inputContext JSON 字段中的 projectId 匹配
            { inputContext: { path: "$.projectId", equals: id } } as any,
            // 兜底：通过 input 文本包含 projectId
            { input: { contains: id } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true, runId: true, status: true, mode: true,
          triggeredBy: true, triggerType: true,
          envelopeSnapshot: true,
          createdAt: true, startedAt: true, completedAt: true,
          durationMs: true, errorMessage: true,
          _count: { select: { steps: true } },
        },
      }),
    ]).catch((err) => {
      logger.error("GET /api/projects/[id]: 聚合查询失败", { error: err instanceof Error ? err.message : "未知" })
      return [[], []] as [any[], any[]]
    })

    // 格式化 workflowRuns 摘要
    const runsBrief = workflowRuns.map((r: any) => {
      const { automationLevel, riskLevel } = extractRiskMeta(r)
      return {
        id: r.id,
        runId: r.runId,
        status: r.status,
        mode: r.mode,
        triggerType: r.triggerType,
        triggeredBy: r.triggeredBy,
        automationLevel,
        riskLevel,
        stepCount: r._count?.steps ?? 0,
        createdAt: r.createdAt.toISOString(),
        startedAt: r.startedAt?.toISOString() ?? null,
        completedAt: r.completedAt?.toISOString() ?? null,
        durationMs: r.durationMs,
        errorMessage: r.errorMessage,
      }
    })

    // 格式化 memories
    const memoriesBrief = memories.map((m: any) => ({
      id: m.id,
      content: m.content,
      summary: m.summary,
      type: m.type,
      tags: (() => { try { return typeof m.tags === "string" ? JSON.parse(m.tags) : (m.tags || []) } catch { return [] } })(),
      version: m.version,
      updatedAt: m.updatedAt.toISOString(),
    }))

    return successResponse({ project: serializeProject(project), memories: memoriesBrief, workflowRuns: runsBrief })
  } catch (err) {
    logger.error("GET /api/projects/[id]: 失败", { error: err instanceof Error ? err.message : "未知" })
    return errorResponse("服务器内部错误")
  }
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

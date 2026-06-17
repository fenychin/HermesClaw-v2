import { prisma } from "@/lib/prisma"; import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext, type WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { ApiResponse } from "@/lib/server/api-response"; import { z } from "zod"

const TaskCreateSchema = z.object({ title: z.string().min(1), description: z.string().optional(), priority: z.string().optional(), source: z.string().optional(), relatedType: z.string().optional(), relatedId: z.string().optional(), projectId: z.string().optional(), dueAt: z.string().optional() })

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request); const url = new URL(request.url)
    const status = url.searchParams.get("status") || undefined; const priority = url.searchParams.get("priority") || undefined
    const source = url.searchParams.get("source") || undefined; const projectId = url.searchParams.get("projectId") || undefined
    const page = Math.max(Number(url.searchParams.get("page")) || 1, 1)
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 500)
    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }
    if (status) where.status = status; if (priority) where.priority = priority; if (source) where.source = source; if (projectId) where.projectId = projectId
    const [tasks, total] = await prisma.$transaction([prisma.task.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }), prisma.task.count({ where })])
    return successResponse({ tasks, total, page, limit })
  } catch (error) { logger.error("GET /api/tasks: 失败", { error: error instanceof Error ? error.message : "未知错误" }); return errorResponse("服务器内部错误") }
}

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const rawBody = await request.json()
  const parsed = TaskCreateSchema.safeParse(rawBody)
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message || "请求体格式错误", 400)
  const { title, description, priority, source, relatedType, relatedId, projectId, dueAt } = parsed.data
  const taskId = crypto.randomUUID(); const actor = await actorFromSession()
  const auditEntry = await createAuditEntry({ actor, action: "task.create", targetType: "task", targetId: taskId, detail: `创建任务: ${title.trim()}`, riskLevel: "low", workspaceId: ctx.workspaceId, automationLevel: "L2", triggeredBy: "user", contextSnapshot: { title: title.trim(), priority: priority ?? "MEDIUM" } })
  try {
    const task = await prisma.task.create({ data: { id: taskId, workspaceId: ctx.workspaceId, title: title.trim(), description: description ?? null, status: "OPEN", priority: priority ?? "MEDIUM", source: source ?? null, relatedType: relatedType ?? null, relatedId: relatedId ?? null, projectId: projectId ?? null, dueAt: dueAt ? new Date(dueAt) : null } })
    await updateAuditEntry({ auditId: auditEntry.auditId, status: "success", contextSnapshot: { taskId, title: title.trim(), status: "OPEN" } })
    return ApiResponse.ok(task)
  } catch (error) { logger.error("POST /api/tasks: 创建失败", { error: error instanceof Error ? error.message : "未知错误" }); await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed", detail: `创建失败: ${error instanceof Error ? error.message : "未知错误"}` }); return ApiResponse.error("创建任务失败", 500) }
}, "MEMBER")

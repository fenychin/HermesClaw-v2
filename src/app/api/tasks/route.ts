import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext, type WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { ApiResponse } from "@/lib/server/api-response"
import { z } from "zod"

/** POST /api/tasks 请求体 schema */
const TaskCreateSchema = z.object({
  title: z.string().min(1, "title 为必填字段"),
  description: z.string().optional(),
  priority: z.string().optional(),
  source: z.string().optional(),
  relatedType: z.string().optional(),
  relatedId: z.string().optional(),
  dueAt: z.string().optional(),
})

/**
 * GET /api/tasks —— 获取任务列表（按创建时间倒序）
 * —— 查询参数：status, priority, source
 * —— RBAC: VIEWER+（最低角色即默认上下文角色，无需额外门禁）
 * —— ALWAYS 包含 workspaceId（AGENTS.md §4.11）
 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const url = new URL(request.url)
    const status = url.searchParams.get("status") || undefined
    const priority = url.searchParams.get("priority") || undefined
    const source = url.searchParams.get("source") || undefined

    // 构建 Prisma where 条件：workspaceId 强制隔离 + 可选筛选
    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }
    if (status) where.status = status
    if (priority) where.priority = priority
    if (source) where.source = source

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })

    return successResponse({ tasks })
  } catch (error) {
    logger.error("GET /api/tasks: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}

/** POST /api/tasks —— 创建任务（写操作，需 MEMBER 以上角色） */
export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const rawBody = await request.json()

  // zod 参数校验
  const parsed = TaskCreateSchema.safeParse(rawBody)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || "请求体格式错误"
    return errorResponse(msg, 400)
  }
  const { title, description, priority, source, relatedType, relatedId, dueAt } = parsed.data

  const taskId = crypto.randomUUID()
  const actor = await actorFromSession()

  // 预记录审计日志（AGENTS.md §5 #3 禁止静默执行：写操作前先留痕）
  const auditEntry = await createAuditEntry({
    actor,
    action: "task.create",
    targetType: "task",
    targetId: taskId,
    detail: `创建任务: ${title.trim()}`,
    riskLevel: "low",
    workspaceId: ctx.workspaceId,
    automationLevel: "L2",
    triggeredBy: "user",
    contextSnapshot: {
      title: title.trim(),
      description: description ?? null,
      priority: priority ?? "MEDIUM",
      source: source ?? null,
      step: "task-create",
    },
  })

  // 创建 Task 记录
  let task: Awaited<ReturnType<typeof prisma.task.create>>
  try {
    task = await prisma.task.create({
      data: {
        id: taskId,
        workspaceId: ctx.workspaceId,
        title: title.trim(),
        description: description ?? null,
        status: "OPEN",
        priority: priority ?? "MEDIUM",
        source: source ?? null,
        relatedType: relatedType ?? null,
        relatedId: relatedId ?? null,
        dueAt: dueAt ? new Date(dueAt) : null,
      },
    })
  } catch (error) {
    logger.error("POST /api/tasks: 创建 Task 记录失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "failed",
      detail: `创建失败: ${error instanceof Error ? error.message : "未知错误"}`,
    })
    return ApiResponse.error("创建任务失败", 500)
  }

  // 更新审计状态为成功
  await updateAuditEntry({
    auditId: auditEntry.auditId,
    status: "success",
    contextSnapshot: { taskId, title: title.trim(), status: "OPEN" },
  })

  return ApiResponse.ok(task)
}, "MEMBER")

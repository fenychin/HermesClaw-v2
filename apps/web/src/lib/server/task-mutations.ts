/**
 * Task Mutation Service
 */
import { prisma } from "@/lib/prisma"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"

export class TaskMutationError extends Error {
  constructor(public readonly httpStatus: number, message: string) { super(message); this.name = "TaskMutationError" }
}

export async function patchTask(id: string, workspaceId: string, status?: string, priority?: string) {
  if (!status && !priority) throw new TaskMutationError(400, "至少提供 status 或 priority 字段")
  const existing = await prisma.task.findFirst({ where: { id, workspaceId } })
  if (!existing) throw new TaskMutationError(404, "任务不存在")
  const actor = await actorFromSession()
  const audit = await createAuditEntry({ actor, action: "task.update", targetType: "task", targetId: id, detail: `更新任务: ${existing.title}`, riskLevel: "low", workspaceId, automationLevel: "L2", triggeredBy: "user", contextSnapshot: { previousStatus: existing.status, newStatus: status, newPriority: priority } })
  try {
    const updated = await prisma.task.update({ where: { id }, data: { ...(status ? { status } : {}), ...(priority ? { priority } : {}) } })
    await updateAuditEntry({ auditId: audit.auditId, status: "success" })
    return updated
  } catch (e) { await updateAuditEntry({ auditId: audit.auditId, status: "failed", detail: `更新失败: ${e instanceof Error ? e.message : "未知错误"}` }); throw new TaskMutationError(500, "更新任务失败") }
}

export async function cancelTask(id: string, workspaceId: string) {
  const existing = await prisma.task.findFirst({ where: { id, workspaceId } })
  if (!existing) throw new TaskMutationError(404, "任务不存在")
  if (existing.status === "CANCELLED") throw new TaskMutationError(409, "任务已取消")
  const actor = await actorFromSession()
  const audit = await createAuditEntry({ actor, action: "task.cancel", targetType: "task", targetId: id, detail: `取消任务: ${existing.title}`, riskLevel: "low", workspaceId, automationLevel: "L2", triggeredBy: "user", contextSnapshot: { previousStatus: existing.status } })
  try {
    const cancelled = await prisma.task.update({ where: { id }, data: { status: "CANCELLED" } })
    await updateAuditEntry({ auditId: audit.auditId, status: "success" })
    return cancelled
  } catch (e) { await updateAuditEntry({ auditId: audit.auditId, status: "failed" }); throw new TaskMutationError(500, "取消任务失败") }
}

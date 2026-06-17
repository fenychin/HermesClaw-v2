/**
 * Memory Mutation Service — 单条记忆变更（PATCH/PUT/DELETE）
 *
 * 从 apps/web/src/app/api/memory/[id]/route.ts 下沉至此。
 */
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/server/audit"
import { checkConfirmValue, checkAutomationGate } from "@/lib/server/guardrail"
import { MemoryService } from "@/lib/server/memory-service"

export class MemoryMutationError extends Error {
  constructor(public readonly httpStatus: number, message: string, public readonly response?: Response) { super(message); this.name = "MemoryMutationError" }
}

export async function patchMemory(id: string, body: any, actor: string) {
  const existing = await prisma.memory.findUnique({ where: { id } })
  if (!existing) throw new MemoryMutationError(404, "记忆不存在")
  if (existing.frozen && (body.content !== undefined || body.summary !== undefined || body.confidence !== undefined)) {
    const guard = await checkConfirmValue(body.confirm, "修改已冻结记忆需二次确认")
    if (!guard.ok) throw new MemoryMutationError(409, "需二次确认", guard.response)
  }
  const data: Record<string, unknown> = {}
  for (const k of ["frozen", "type", "content", "summary", "confidence", "reason", "tags"] as const) if (body[k] !== undefined) data[k] = body[k]
  if (data.type && !["short", "mid", "long"].includes(data.type as string)) throw new MemoryMutationError(400, `无效的记忆类型: ${data.type}`)
  return MemoryService.updateMemory(existing.workspaceId, id, data, actor)
}

export async function putMemory(id: string, ctxWorkspaceId: string, body: any, actor: string) {
  const existing = await prisma.memory.findUnique({ where: { id } })
  if (!existing) throw new MemoryMutationError(404, "记忆不存在")
  if (existing.workspaceId !== ctxWorkspaceId) throw new MemoryMutationError(403, "无权访问此记忆")
  const summary = body.content ? (body.content.length > 50 ? body.content.substring(0, 50) + "..." : body.content) : existing.summary
  const updated = await MemoryService.updateMemory(existing.workspaceId, id, { content: body.content, summary, tags: body.tags, reason: body.reason || "手动编辑更新" }, actor)
  void writeAuditLog({ actor, action: "memory.updated", targetType: "memory", targetId: id, detail: `更新 (v${updated.version}): ${updated.summary}`, riskLevel: "low", workspaceId: ctxWorkspaceId }).catch(() => {})
  const revisionCount = await prisma.memoryRevision.count({ where: { memoryId: id } })
  let tags: any[] = []; try { tags = JSON.parse(updated.tags || "[]") } catch {}
  return { id: updated.id, workspaceId: updated.workspaceId, projectId: updated.projectId, type: updated.type, content: updated.content, summary: updated.summary, source: updated.source, tags, version: updated.version, revisionCount, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() }
}

export async function deleteMemory(id: string, ctxWorkspaceId: string, request: Request) {
  const existing = await prisma.memory.findUnique({ where: { id } })
  if (!existing) throw new MemoryMutationError(404, "记忆不存在")
  if (existing.workspaceId !== ctxWorkspaceId) throw new MemoryMutationError(403, "无权访问此记忆")
  const gate = await checkAutomationGate({ automationLevel: "L3", riskLevel: "high", confirmed: new URL(request.url).searchParams.get("confirm") === "true", actionName: `归档记忆：${existing.summary}` })
  if (!gate.ok) throw new MemoryMutationError(409, "需确认", gate.response)
  await prisma.memory.update({ where: { id }, data: { status: "archived" } })
  void writeAuditLog({ actor: gate.actor, action: "memory.archived", targetType: "memory", targetId: id, detail: `软删除: ${existing.summary}`, riskLevel: "medium", workspaceId: ctxWorkspaceId }).catch(() => {})
  return { message: "记忆已归档（软删除）" }
}

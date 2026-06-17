/**
 * Connector Mutation Service — 连接器变更
 */
import { prisma } from "@/lib/prisma"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { checkConfirmQuery } from "@/lib/server/guardrail"

export class ConnectorMutationError extends Error {
  constructor(public readonly httpStatus: number, message: string, public readonly response?: Response) { super(message); this.name = "ConnectorMutationError" }
}

export async function patchConnector(id: string, workspaceId: string, body: any) {
  const existing = await prisma.connector.findUnique({ where: { id } })
  if (!existing) throw new ConnectorMutationError(404, "连接器不存在")
  const data: Record<string, unknown> = {}; const changes: string[] = []
  if (body.status !== undefined) { if (!["connected", "available", "disconnected", "error"].includes(body.status)) throw new ConnectorMutationError(400, `无效状态: ${body.status}`); data.status = body.status; changes.push(`status: ${existing.status} → ${body.status}`); if (body.status === "connected") data.lastSync = new Date().toISOString() }
  if (body.name !== undefined) { data.name = body.name; changes.push(`name: ${existing.name} → ${body.name}`) }
  if (body.description !== undefined) { data.description = body.description; changes.push("description 已更新") }
  const actor = await actorFromSession(); const hasStatusChange = body.status !== undefined
  const entry = hasStatusChange ? await createAuditEntry({ actor, action: body.status === "connected" ? "connector.connect" : body.status === "disconnected" ? "connector.disconnect" : "connector.update", targetType: "connector", targetId: id, detail: existing.name, riskLevel: body.status === "connected" ? "medium" : "low", workspaceId, automationLevel: "L2", triggeredBy: "user" }) : null
  const connector = await prisma.connector.update({ where: { id }, data })
  if (entry) await updateAuditEntry({ auditId: entry.auditId, status: "success", detail: `${existing.name}：${changes.join("；")}` })
  return connector
}

export async function deleteConnector(id: string, workspaceId: string, request: Request) {
  const existing = await prisma.connector.findUnique({ where: { id } })
  if (!existing) throw new ConnectorMutationError(404, "连接器不存在")
  const guard = await checkConfirmQuery(request, "删除连接器需二次确认")
  if (!guard.ok) throw new ConnectorMutationError(409, "需确认", guard.response)
  const entry = await createAuditEntry({ actor: guard.actor, action: "delete.connector", targetType: "connector", targetId: id, detail: existing.name, riskLevel: "high", workspaceId, automationLevel: "L3", triggeredBy: "user" })
  await prisma.connector.delete({ where: { id } })
  await updateAuditEntry({ auditId: entry.auditId, status: "success", detail: `已删除连接器 ${existing.name}` })
  return { message: "连接器已删除" }
}

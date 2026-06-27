/**
 * Connector Mutation Service — 连接器变更
 */
import { prisma } from "@/lib/prisma"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { checkConfirmQuery } from "@/lib/server/guardrail"

export class ConnectorMutationError extends Error {
  constructor(public readonly httpStatus: number, message: string, public readonly response?: Response) { super(message); this.name = "ConnectorMutationError" }
}

/** 安全的 JSON 字段解析 */
function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[]
  if (typeof raw !== "string") return []
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}

export async function patchConnector(id: string, workspaceId: string, body: any) {
  const existing = await prisma.connector.findUnique({ where: { id } })
  if (!existing) throw new ConnectorMutationError(404, "连接器不存在")

  // 内置连接器只读保护
  if (existing.source === "builtin") {
    // 仅允许 status 变更，不允许编辑 name/description/其他配置字段
    if (body.name !== undefined || body.description !== undefined) {
      throw new ConnectorMutationError(403, "系统内置连接器不可修改名称或描述")
    }
  }

  const data: Record<string, unknown> = {}; const changes: string[] = []
  if (body.status !== undefined) { if (!["connected", "available", "disconnected", "error"].includes(body.status)) throw new ConnectorMutationError(400, `无效状态: ${body.status}`); data.status = body.status; changes.push(`status: ${existing.status} → ${body.status}`); if (body.status === "connected") data.lastSync = new Date().toISOString() }
  if (body.name !== undefined) { data.name = body.name; changes.push(`name: ${existing.name} → ${body.name}`) }
  if (body.description !== undefined) { data.description = body.description; changes.push("description 已更新") }
  if (body.source !== undefined) { data.source = body.source; changes.push(`source: ${existing.source} → ${body.source}`) }
  if (body.version !== undefined) { data.version = body.version; changes.push("version 已更新") }
  if (body.health !== undefined) { data.health = body.health; changes.push(`health: ${existing.health || "无"} → ${body.health}`) }
  const actor = await actorFromSession(); const hasStatusChange = body.status !== undefined
  const entry = hasStatusChange ? await createAuditEntry({ actor, action: body.status === "connected" ? "connector.connect" : body.status === "disconnected" ? "connector.disconnect" : "connector.update", targetType: "connector", targetId: id, detail: existing.name, riskLevel: body.status === "connected" ? "medium" : "low", workspaceId, automationLevel: "L2", triggeredBy: "user" }) : null
  const connector = await prisma.connector.update({ where: { id }, data })
  if (entry) await updateAuditEntry({ auditId: entry.auditId, status: "success", detail: `${existing.name}：${changes.join("；")}` })
  return connector
}

export async function deleteConnector(id: string, workspaceId: string, request: Request) {
  const existing = await prisma.connector.findUnique({ where: { id } })
  if (!existing) throw new ConnectorMutationError(404, "连接器不存在")

  // 系统内置连接器不可删除
  if (existing.source === "builtin") {
    throw new ConnectorMutationError(403, "系统内置连接器不可删除")
  }

  // 检查是否有智能体依赖此连接器
  const usedByAgents = parseJsonArray(existing.usedByAgents)
  if (usedByAgents.length > 0) {
    let agentNames: string[] = []
    try {
      const agents = await prisma.agent.findMany({ where: { id: { in: usedByAgents } }, select: { name: true } })
      agentNames = agents.map(a => a.name)
    } catch {}
    const names = agentNames.length > 0 ? agentNames.join("、") : usedByAgents.join("、")
    throw new ConnectorMutationError(409, `无法删除：连接器正被 ${usedByAgents.length} 个智能体使用（${names}），请先解绑后再删除`)
  }

  const guard = await checkConfirmQuery(request, "删除连接器需二次确认")
  if (!guard.ok) throw new ConnectorMutationError(409, "需确认", guard.response)
  const entry = await createAuditEntry({ actor: guard.actor, action: "delete.connector", targetType: "connector", targetId: id, detail: existing.name, riskLevel: "high", workspaceId, automationLevel: "L3", triggeredBy: "user" })
  await prisma.connector.delete({ where: { id } })
  await updateAuditEntry({ auditId: entry.auditId, status: "success", detail: `已删除连接器 ${existing.name}` })
  return { message: "连接器已删除" }
}
import { prisma } from "@/lib/prisma"
import { stringifyJsonField } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession, createAuditEntry, updateAuditEntry } from "@/lib/server/audit"
import { writeAgentLog } from "@/lib/server/agent-log"
import { checkConfirmQuery, checkConfirmValue, checkAutomationGate } from "@/lib/server/guardrail"

export class AgentMutationError extends Error {
  constructor(public readonly httpStatus: number, message: string, public readonly response?: Response) { super(message); this.name = "AgentMutationError" }
}

export async function patchAgent(id: string, workspaceId: string, body: any) {
  const existing = await prisma.agent.findUnique({ where: { id, workspaceId } })
  if (!existing) throw new AgentMutationError(404, "智能体不存在")
  const isBoundaryChange = body.canDo !== undefined || body.cannotDo !== undefined
  if (isBoundaryChange) {
    const gate = await checkAutomationGate({ automationLevel: body.automationLevel ?? existing.automationLevel, riskLevel: "high", confirmed: body.confirm === true, actionName: "修改任务边界" })
    if (!gate.ok) throw new AgentMutationError(409, "需确认", gate.response)
    const guard = await checkConfirmValue(body.confirm, "修改智能体任务边界需二次确认")
    if (!guard.ok) throw new AgentMutationError(409, "需确认", guard.response)
  }

  // 边界变更：自动化等级发生变更
  const isAutomationLevelChange = body.automationLevel !== undefined && body.automationLevel !== existing.automationLevel
  let auditEntry: { auditId: string; ok: boolean } | null = null
  if (isAutomationLevelChange) {
    auditEntry = await createAuditEntry({
      actor: await actorFromSession(),
      action: "automation.level.change",
      targetType: "agent",
      targetId: id,
      detail: `修改智能体「${existing.name}」自动化等级: ${existing.automationLevel} → ${body.automationLevel}`,
      riskLevel: "high",
      workspaceId,
      automationLevel: body.automationLevel,
      contextSnapshot: {
        agentId: id,
        agentName: existing.name,
        oldLevel: existing.automationLevel,
        newLevel: body.automationLevel,
      }
    })
  }

  try {
    const data: Record<string, unknown> = {}
    for (const k of ["name", "role", "description", "status", "memoryPermission", "automationLevel"] as const) if (body[k] !== undefined) data[k] = body[k]
    for (const k of ["category", "bindSkills", "bindConnectors", "canDo", "cannotDo"] as const) if (body[k] !== undefined) data[k] = stringifyJsonField(body[k])
    const agent = await prisma.agent.update({ where: { id }, data })
    if (body.status !== undefined && body.status !== existing.status) void writeAgentLog({ agentId: id, source: "agent", taskName: `状态变更: ${existing.status} → ${body.status}`, status: body.status === "error" ? "error" : "success", duration: "0ms", detail: "手动触发状态变更" })
    if (isBoundaryChange) void writeAuditLog({ actor: await actorFromSession(), action: "update.agent.boundary", targetType: "agent", targetId: id, detail: existing.name, riskLevel: "high", workspaceId })
    
    if (auditEntry?.ok) {
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "success",
        detail: `成功将智能体「${existing.name}」自动化等级修改为 ${body.automationLevel}`,
      })
    }
    
    return agent
  } catch (error) {
    if (auditEntry?.ok) {
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "failed",
        detail: `修改自动化等级失败: ${error instanceof Error ? error.message : "未知错误"}`,
      })
    }
    throw error
  }
}

export async function deleteAgent(id: string, workspaceId: string, request: Request) {
  const existing = await prisma.agent.findUnique({ where: { id, workspaceId } })
  if (!existing) throw new AgentMutationError(404, "智能体不存在")
  const guard = await checkConfirmQuery(request, "删除智能体需二次确认")
  if (!guard.ok) throw new AgentMutationError(409, "需确认", guard.response)
  await prisma.agentLog.updateMany({ where: { agentId: id }, data: { archivedAt: new Date() } })
  await prisma.agent.delete({ where: { id, workspaceId } })
  void writeAuditLog({ actor: guard.actor, action: "delete.agent", targetType: "agent", targetId: id, detail: existing.name, riskLevel: "high", workspaceId })
  return { message: "智能体已删除" }
}

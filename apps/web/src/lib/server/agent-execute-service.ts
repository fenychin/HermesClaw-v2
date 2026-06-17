/**
 * Agent Execute Service
 */
import { prisma } from "@/lib/prisma"
import { assertWithinBoundary } from "@/lib/server/boundary"
import { guardOutput } from "@/lib/server/output-guard"
import { writeAgentLog } from "@/lib/server/agent-log"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { selectModel } from "@/lib/server/model-router"
import { callLlmText } from "@/lib/server/llm-provider"
import { loadIndustryPrompt } from "@hermesclaw/industry-pack-sdk"

export class AgentExecuteError extends Error {
  constructor(public readonly httpStatus: number, message: string) { super(message); this.name = "AgentExecuteError" }
}

export async function executeAgentAction(opts: { agentId: string; workspaceId: string; industryId?: string; action: string }) {
  const agent = await prisma.agent.findUnique({ where: { id: opts.agentId, workspaceId: opts.workspaceId } })
  if (!agent) throw new AgentExecuteError(404, "智能体不存在")
  const boundary = await assertWithinBoundary(opts.agentId, opts.action, opts.workspaceId)
  if (!boundary.allowed) {
    const actor = await actorFromSession()
    void writeAgentLog({ source: "agent", taskName: `${agent.name}: 执行被拒绝`, status: "error", duration: "0s", detail: `越界: ${opts.action} → ${boundary.violation}`, riskLevel: "high" })
    void writeAuditLog({ actor, action: "agent.boundary_violation", targetType: "agent", targetId: opts.agentId, detail: `边界违规: ${boundary.violation}`, riskLevel: "high", workspaceId: opts.workspaceId }).catch(() => {})
    return { status: "blocked" as const, violation: boundary.violation }
  }
  const systemPrompt = loadIndustryPrompt(opts.industryId ?? "foreign-trade", agent.role || "默认") ?? `你是 ${agent.name}，请用中文回复。`
  const decision = await selectModel({ taskType: "chat", riskLevel: "low", estimatedTokens: Math.ceil((systemPrompt.length + opts.action.length) / 4), workspaceId: opts.workspaceId })
  const result = await callLlmText({ provider: decision.provider, model: decision.model, systemPrompt, userPrompt: opts.action, maxTokens: 2048 })
  const guard = guardOutput(result, { minLength: 1, maxLength: 8000 })
  if (!guard.ok) return { status: "blocked" as const, violation: guard.reason }
  const actor = await actorFromSession()
  void writeAgentLog({ source: "agent", taskName: `${agent.name}: 执行任务`, status: "success", duration: "1s", detail: opts.action.slice(0, 200), riskLevel: "low" })
  void writeAuditLog({ actor, action: "agent.execute", targetType: "agent", targetId: opts.agentId, detail: `执行 Agent: ${agent.name}`, riskLevel: "medium", workspaceId: opts.workspaceId }).catch(() => {})
  return { status: "ok" as const, result, model: decision.model }
}

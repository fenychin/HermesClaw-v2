import { logger } from '@/lib/logger'
import { parseJsonField, successResponse, errorResponse } from "@/lib/api-utils"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { withRBAC } from "@/lib/server/api-handler"
import { checkAutomationGate } from "@/lib/server/guardrail"
import type { WorkspaceContext } from "@/lib/workspace"
import { loadSkillForExecution } from "@/lib/server/skills"
import { executeSkillTest } from "@hermesclaw/openclaw-adapter"

export const POST = withRBAC<{ params: Promise<{ id: string }> }>(async (request: Request, ctx: WorkspaceContext, { params }) => {
  const { id } = await params
  const skill = await loadSkillForExecution(id)
  if (!skill) return errorResponse("技能不存在", 404)
  if (skill.workspaceId !== ctx.workspaceId) return errorResponse("无权访问该技能", 403)
  const gate = await checkAutomationGate({ automationLevel: skill.automationLevel as "L1" | "L2" | "L3" | "L4", riskLevel: "low", confirmed: skill.automationLevel === "L3" ? new URL(request.url).searchParams.get("confirm") === "true" : true, actionName: `测试技能：${skill.name}` })
  if (!gate.ok) return gate.response
  const actor = await actorFromSession()
  const entry = await createAuditEntry({ actor, action: "skill.test", targetType: "skill", targetId: skill.id, detail: `测试技能: ${skill.name}`, riskLevel: gate.level === "L3" ? "medium" : "low", workspaceId: ctx.workspaceId, automationLevel: skill.automationLevel as "L1" | "L2" | "L3" | "L4", triggeredBy: "user" })
  try {
    // 三域调用点：[执行域] 执行交由 openclaw-adapter，门卫层只做读 DB / 审计
    const testSummary = await executeSkillTest(
      { skill: { id: skill.id, name: skill.name, automationLevel: skill.automationLevel, version: skill.version, status: skill.status, inputSchema: skill.inputSchema, outputSchema: skill.outputSchema, scenarios: skill.scenarios } },
      { parseJsonField: (raw, fallback) => parseJsonField(raw as string, fallback) },
    )
    await updateAuditEntry({ auditId: entry.auditId, status: "success", detail: `测试完成: ${skill.name}` })
    return successResponse({ message: `技能「${skill.name}」配置校验通过`, testSummary })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "未知错误"
    logger.error("[skills/test] 失败", { error: errMsg })
    await updateAuditEntry({ auditId: entry.auditId, status: "failed", detail: `测试失败: ${errMsg}` })
    return errorResponse(`技能测试执行失败: ${errMsg}`)
  }
}, "MEMBER")

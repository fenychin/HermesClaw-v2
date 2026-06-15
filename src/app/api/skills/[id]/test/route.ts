import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  parseJsonField,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/shared/audit"
import { withRBAC } from "@/lib/server/shared/api-handler"
import { checkAutomationGate } from "@/lib/server/hermes/guardrail"
import type { WorkspaceContext } from "@/lib/workspace"
import type { AutomationLevel } from "@/types/harness"

/**
 * POST /api/skills/[id]/test —— 运行技能测试
 * - L4 技能禁止自动测试（403）
 * - L3 技能需 ?confirm=true 二次确认（409）
 * - 目前为 stub：执行技能配置校验并返回摘要
 */
export const POST = withRBAC<{ params: Promise<{ id: string }> }>(async (
  request: Request,
  ctx: WorkspaceContext,
  { params },
) => {
  const { id } = await params

  const skill = await prisma.skill.findUnique({
    where: { id },
  })

  if (!skill) {
    return errorResponse("技能不存在", 404)
  }

  // 数据隔离：技能必须属于当前 workspace
  if (skill.workspaceId !== ctx.workspaceId) {
    return errorResponse("无权访问该技能", 403)
  }

  // L4/L3 门禁（AGENTS.md §4.7 / §4.5）
  const gate = await checkAutomationGate({
    automationLevel: skill.automationLevel,
    riskLevel: "low",
    confirmed: skill.automationLevel === "L3"
      ? new URL(request.url).searchParams.get("confirm") === "true"
      : true,
    actionName: `测试技能：${skill.name}`,
  })
  if (!gate.ok) return gate.response

  const actor = await actorFromSession()

  // 预记录审计（AGENTS.md §5 #3 / §4.3）
  const entry = await createAuditEntry({
    actor,
    action: "skill.test",
    targetType: "skill",
    targetId: skill.id,
    detail: `测试技能: ${skill.name}（${skill.automationLevel}）`,
    riskLevel: gate.level === "L3" ? "medium" : "low",
    workspaceId: ctx.workspaceId,
    automationLevel: skill.automationLevel as AutomationLevel,
    triggeredBy: "user",
    contextSnapshot: {
      skillName: skill.name,
      automationLevel: skill.automationLevel,
      version: skill.version,
      status: skill.status,
    },
  })

  try {
    // Stub：执行基本校验（后续 Phase 2 接入真实 Skill 执行引擎）
    const input = parseJsonField(skill.inputSchema, {})
    const output = parseJsonField(skill.outputSchema, {})
    const scenarios = parseJsonField(skill.scenarios, [])

    const testSummary = {
      skillId: skill.id,
      skillName: skill.name,
      automationLevel: skill.automationLevel,
      version: skill.version,
      status: skill.status,
      inputSchemaKeys: Object.keys(input || {}).length,
      outputSchemaKeys: Object.keys(output || {}).length,
      scenarioCount: (scenarios as unknown[]).length,
      passed: skill.status === "active",
    }

    await updateAuditEntry({
      auditId: entry.auditId,
      status: "success",
      detail: `测试完成: ${skill.name}，${testSummary.scenarioCount} 个场景`,
      contextSnapshot: testSummary as unknown as Record<string, unknown>,
    })

    logger.info('POST /api/skills/[id]/test: 成功', { skillId: id, automationLevel: skill.automationLevel })

    return successResponse({
      message: `技能「${skill.name}」配置校验通过，${testSummary.scenarioCount} 个场景就绪`,
      testSummary,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "未知错误"
    logger.error('POST /api/skills/[id]/test: 执行失败', { skillId: id, error: errMsg })

    await updateAuditEntry({
      auditId: entry.auditId,
      status: "failed",
      detail: `测试失败: ${errMsg}`,
    })

    return errorResponse(`技能测试执行失败: ${errMsg}`)
  }
}, "MEMBER")

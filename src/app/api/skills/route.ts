import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import { parseJsonField, successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import { validateBody, SkillCreateSchema } from "@/lib/validators"
import type { WorkspaceContext } from "@/lib/workspace"
import { rateLimit } from "@/lib/rate-limit"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"

/** 序列化 Skill，将 JSON 字符串字段反序列化为数组 */
function serializeSkill(skill: Record<string, unknown>) {
  return {
    ...skill,
    usedByAgents: parseJsonField(skill.usedByAgents as string, []),
    scenarios: parseJsonField(skill.scenarios as string, []),
  }
}

/** GET /api/skills —— 获取所有技能列表 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const skills = await prisma.skill.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
    })
    return successResponse({
      skills: skills.map((s) => serializeSkill(s as unknown as Record<string, unknown>)),
    })
  } catch (error) {
    logger.error('GET /api/skills: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** POST /api/skills —— 创建新技能（沉淀为技能） */
export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  // 频率限制：每分钟最多 10 次
  const ip = request.headers.get("x-forwarded-for") || "unknown"
  if (!rateLimit(ip, 10, 60_000)) {
    return Response.json(
      { error: "请求过于频繁，请稍后重试" },
      { status: 429 },
    )
  }

  const rawBody = await request.json().catch(() => null)
  const parsed = validateBody(rawBody, SkillCreateSchema)
  if (parsed instanceof Response) return parsed
  const body = parsed

  const skillId = crypto.randomUUID()
  const actor = await actorFromSession()

  // §4.3 + §5 #3 预记录审计日志
  const auditEntry = await createAuditEntry({
    actor,
    action: "skill.create",
    targetType: "skill",
    targetId: skillId,
    detail: `创建技能: ${body.name}`,
    riskLevel: "low",
    workspaceId: ctx.workspaceId,
    automationLevel: body.automationLevel ?? "L2",
    triggeredBy: "user",
    contextSnapshot: { name: body.name, source: "custom", step: "skill-create" },
  })

  try {
    const skill = await prisma.skill.create({
      data: {
        id: skillId,
        workspaceId: ctx.workspaceId,
        name: body.name,
        description: body.description,
        version: body.version ?? "v1.0.0",
        category: body.category ?? "custom:通用",
        source: "custom",
        status: "active",
        inputSchema: body.inputSchema ?? JSON.stringify({
          role: body.name,
          capabilities: ["根据对话历史执行对应任务"],
          commandName: body.name.toLowerCase().replace(/\s+/g, "-"),
        }),
        outputSchema: body.outputSchema ?? JSON.stringify({
          constraints: ["不得直接执行高风险操作"],
          disableModelInvocation: false,
        }),
        usedByAgents: "[]",
        scenarios: body.scenarios ?? "[]",
        automationLevel: body.automationLevel ?? "L2",
      },
    })

    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "success",
      contextSnapshot: { skillId, name: body.name },
    })

    return successResponse(
      { skill: serializeSkill(skill as unknown as Record<string, unknown>) },
      201,
    )
  } catch (error) {
    logger.error('POST /api/skills: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "failed",
      detail: `创建失败: ${error instanceof Error ? error.message : "未知错误"}`,
    })
    return errorResponse("创建技能失败")
  }
}, "MEMBER")

import { prisma } from "@/lib/prisma"; import { logger } from '@/lib/logger'
import { successResponse, errorResponse, serializeSkill } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"; import { withRBAC } from "@/lib/server/api-handler"
import { validateBody, SkillCreateSchema } from "@/lib/server/validators"
import type { WorkspaceContext } from "@/lib/workspace"; import { rateLimit } from "@/lib/rate-limit"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { getSkillsWithStats } from "@/lib/server/skills"

export async function GET(request: Request) {
  try { const ctx = await buildWorkspaceContext(request); const skills = await getSkillsWithStats(ctx.workspaceId); return successResponse({ skills }) }
  catch (error) { logger.error('GET /api/skills: 失败'); return errorResponse("服务器内部错误") }
}

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const ip = request.headers.get("x-forwarded-for") || "unknown"
  if (!rateLimit(ip, 10, 60_000)) return Response.json({ error: "请求过于频繁" }, { status: 429 })
  const rawBody = await request.json().catch(() => null)
  const parsed = validateBody(rawBody, SkillCreateSchema); if (parsed instanceof Response) return parsed; const body = parsed
  const skillId = crypto.randomUUID(); const actor = await actorFromSession()
  const auditEntry = await createAuditEntry({ actor, action: "skill.create", targetType: "skill", targetId: skillId, detail: `创建技能: ${body.name}`, riskLevel: "low", workspaceId: ctx.workspaceId, automationLevel: body.automationLevel ?? "L2", triggeredBy: "user" })
  try {
    const skill = await prisma.skill.create({ data: { id: skillId, workspaceId: ctx.workspaceId, name: body.name, description: body.description, version: body.version ?? "v1.0.0", category: body.category ?? "custom:通用", source: "custom", status: "active", inputSchema: body.inputSchema ?? JSON.stringify({ role: body.name }), outputSchema: body.outputSchema ?? JSON.stringify({}), usedByAgents: "[]", scenarios: body.scenarios ?? "[]", automationLevel: body.automationLevel ?? "L2" } })
    await updateAuditEntry({ auditId: auditEntry.auditId, status: "success" })
    return successResponse({ skill: serializeSkill(skill as any) }, 201)
  } catch (error) { await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed" }); return errorResponse("创建技能失败") }
}, "MEMBER")

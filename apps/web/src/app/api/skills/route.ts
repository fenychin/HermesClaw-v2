import { logger } from '@/lib/logger'
import { successResponse, errorResponse, serializeSkill } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import { validateBody, SkillCreateSchema } from "@/lib/server/validators"
import type { WorkspaceContext } from "@/lib/workspace"
import { rateLimit } from "@/lib/rate-limit"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { getSkillsWithStats, createSkillRecord } from "@/lib/server/skills"

export async function GET(request: Request) {
  try { const ctx = await buildWorkspaceContext(request); const skills = await getSkillsWithStats(ctx.workspaceId); return successResponse({ skills }) }
  catch { logger.error('GET /api/skills: 失败'); return errorResponse("服务器内部错误") }
}

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const ip = request.headers.get("x-forwarded-for") || "unknown"
  if (!rateLimit(ip, 10, 60_000)) return Response.json({ error: "请求过于频繁" }, { status: 429 })
  const parsed = validateBody(await request.json().catch(() => null), SkillCreateSchema)
  if (parsed instanceof Response) return parsed
  const actor = await actorFromSession()
  const auditEntry = await createAuditEntry({ actor, action: "skill.create", targetType: "skill", targetId: "pending", detail: `创建技能: ${parsed.name}`, riskLevel: "low", workspaceId: ctx.workspaceId, automationLevel: (parsed.automationLevel ?? "L2") as "L1" | "L2" | "L3" | "L4", triggeredBy: "user" })
  try {
    const skill = await createSkillRecord({ workspaceId: ctx.workspaceId, ...parsed })
    await updateAuditEntry({ auditId: auditEntry.auditId, status: "success" })
    return successResponse({ skill: serializeSkill(skill as unknown as Record<string, unknown>) }, 201)
  } catch { await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed" }); return errorResponse("创建技能失败") }
}, "MEMBER")

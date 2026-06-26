import { logger } from '@/lib/logger'
import { successResponse, errorResponse, serializeSkill } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import { validateBody, SkillCreateSchema } from "@/lib/server/validators"
import type { WorkspaceContext } from "@/lib/workspace"
import { rateLimit } from "@/lib/rate-limit"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { querySkills, createSkillRecord } from "@/lib/server/skills"

/** GET /api/skills?page=1&pageSize=20&source=CUSTOM */
export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const url = new URL(request.url)
  const page = parseInt(url.searchParams.get("page") || "1", 10)
  const pageSize = parseInt(url.searchParams.get("pageSize") || "20", 10)
  const source = url.searchParams.get("source") || undefined
  try {
    const result = await querySkills({ workspaceId: ctx.workspaceId, page, pageSize, source })
    return successResponse(result)
  } catch (err) {
    logger.error("GET /api/skills: 查询失败", { error: String(err) })
    return errorResponse("服务器内部错误")
  }
}, "MEMBER")

/** POST /api/skills — 创建自定义技能 */
export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const ip = request.headers.get("x-forwarded-for") || "unknown"
  if (!rateLimit(ip, 10, 60_000)) return Response.json({ error: "请求过于频繁" }, { status: 429 })
  const parsed = validateBody(await request.json().catch(() => null), SkillCreateSchema)
  if (parsed instanceof Response) return parsed

  // 校验 skillMdContent (P1)
  if (parsed.skillMdContent) {
    const { validateSkillMd, parseFrontmatter } = await import("@hermesclaw/industry-pack-sdk")
    const validation = validateSkillMd(parsed.skillMdContent)
    if (!validation.valid) {
      return errorResponse(`SKILL.md 校验失败: ${validation.errors.join("; ")}`, 400)
    }
    const fm = parseFrontmatter(parsed.skillMdContent)
    if (fm && fm.name && fm.name !== parsed.name) {
      return errorResponse(`前言中的 name "${fm.name}" 与技能名称 "${parsed.name}" 不匹配`, 400)
    }
  }

  const actor = await actorFromSession()
  const auditEntry = await createAuditEntry({
    actor, action: "skill.create", targetType: "skill", targetId: "pending",
    detail: `创建技能: ${parsed.name}`, riskLevel: "low",
    workspaceId: ctx.workspaceId,
    automationLevel: (parsed.automationLevel ?? "L2") as "L1" | "L2" | "L3" | "L4",
    triggeredBy: "user"
  })
  try {
    const skill = await createSkillRecord({
      workspaceId: ctx.workspaceId,
      name: parsed.name,
      description: parsed.description,
      version: parsed.version,
      category: parsed.category,
      source: parsed.source,
      inputSchema: parsed.inputSchema,
      outputSchema: parsed.outputSchema,
      scenarios: parsed.scenarios,
      automationLevel: parsed.automationLevel,
      skillMdContent: parsed.skillMdContent,
    })
    await updateAuditEntry({ auditId: auditEntry.auditId, status: "success", targetId: skill.id })
    return successResponse({ skill: serializeSkill(skill as unknown as Record<string, unknown>) }, 201)
  } catch (err) {
    await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed" })
    return errorResponse("创建技能失败")
  }
}, "MEMBER")

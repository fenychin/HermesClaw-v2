import { logger } from '@/lib/logger'
import { successResponse, errorResponse, serializeSkill } from "@/lib/api-utils"
import { withRBAC } from "@/lib/server/api-handler"
import { validateBody, SkillUpdateSchema } from "@/lib/server/validators"
import type { WorkspaceContext } from "@/lib/workspace"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { getSkillById, updateSkillRecord, deleteSkillRecord } from "@/lib/server/skills"

import * as fs from "fs"
import * as path from "path"

type RouteParams = { params: Promise<{ id: string }> }

function getSkillDirectory(skillName: string): string {
  return path.join(process.cwd(), ".agents", "skills", skillName)
}

function buildFileTree(dir: string, baseDir: string): any[] {
  const files = fs.readdirSync(dir)
  const result: any[] = []
  for (const file of files) {
    if (file === "node_modules" || file === ".git") continue
    const fullPath = path.join(dir, file)
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/")
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      result.push({ path: relativePath, type: "directory" })
      result.push(...buildFileTree(fullPath, baseDir))
    } else {
      result.push({ path: relativePath, type: "file" })
    }
  }
  return result
}

/** GET /api/skills/[id] — 单条技能详情 */
export const GET = withRBAC<RouteParams>(async (_request: Request, ctx: WorkspaceContext, { params }) => {
  const { id } = await params
  const skill = await getSkillById(id)
  if (!skill) return errorResponse("技能不存在", 404)
  if (skill.workspaceId !== ctx.workspaceId) return errorResponse("无权访问该技能", 403)

  let fileTree: any[] = []
  const skillDir = getSkillDirectory(skill.name)
  if (fs.existsSync(skillDir) && fs.statSync(skillDir).isDirectory()) {
    try {
      fileTree = buildFileTree(skillDir, skillDir)
    } catch (err) {
      logger.warn(`Failed to read file tree for skill directory: ${skillDir}`, { error: String(err) })
    }
  }

  // 兜底：如果无磁盘目录，或读取为空，则虚拟一个 SKILL.md 节点
  if (fileTree.length === 0) {
    logger.warn(`Skill directory not found or empty, returning fallback fileTree`, { skillName: skill.name, skillDir })
    fileTree = [{ path: "SKILL.md", type: "file" }]
  }

  const serialized = serializeSkill(skill as unknown as Record<string, unknown>)
  return successResponse({
    skill: {
      ...serialized,
      fileTree
    }
  })
}, "MEMBER")

/** PUT /api/skills/[id] — 更新技能（含重校验） */
export const PUT = withRBAC<RouteParams>(async (request: Request, ctx: WorkspaceContext, { params }) => {
  const { id } = await params
  const skill = await getSkillById(id)
  if (!skill) return errorResponse("技能不存在", 404)
  if (skill.workspaceId !== ctx.workspaceId) return errorResponse("无权访问该技能", 403)
  if (skill.source === "BUILTIN") return errorResponse("内置技能不可修改", 403)

  const parsed = validateBody(await request.json().catch(() => null), SkillUpdateSchema)
  if (parsed instanceof Response) return parsed

  // 校验 skillMdContent (P1)
  let skillMdWarnings: string[] = []
  if (parsed.skillMdContent) {
    const { validateSkillMd, parseFrontmatter } = await import("@hermesclaw/industry-pack-sdk")
    const validation = validateSkillMd(parsed.skillMdContent)
    if (!validation.valid) {
      return errorResponse(`SKILL.md 校验失败: ${validation.errors.join("; ")}`, 400)
    }
    skillMdWarnings = validation.warnings ?? []
    const fm = parseFrontmatter(parsed.skillMdContent)
    const targetName = parsed.name || skill.name
    if (fm && fm.name && fm.name !== targetName) {
      return errorResponse(`前言中的 name "${fm.name}" 与技能名称 "${targetName}" 不匹配`, 400)
    }
  }

  const actor = await actorFromSession()
  const auditEntry = await createAuditEntry({
    actor, action: "skill.update", targetType: "skill", targetId: id,
    detail: `更新技能: ${skill.name}${skillMdWarnings.length > 0 ? `; SKILL.md warnings: ${skillMdWarnings.join("; ")}` : ""}`,
    riskLevel: skillMdWarnings.length > 0 ? "medium" : "low",
    workspaceId: ctx.workspaceId,
    automationLevel: (skill.automationLevel ?? "L2") as "L1" | "L2" | "L3" | "L4",
    triggeredBy: "user",
    contextSnapshot: skillMdWarnings.length > 0 ? { skillMdWarnings } : undefined,
  })
  try {
    const updated = await updateSkillRecord(id, { id, ...parsed })
    await updateAuditEntry({ auditId: auditEntry.auditId, status: "success" })
    const responsePayload: Record<string, unknown> = { skill: serializeSkill(updated as unknown as Record<string, unknown>) }
    if (skillMdWarnings.length > 0) responsePayload.warnings = skillMdWarnings
    return successResponse(responsePayload)
  } catch (err) {
    logger.error("更新技能失败:", { error: String(err) })
    await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed" })
    return errorResponse("更新技能失败")
  }
}, "MEMBER")

/** DELETE /api/skills/[id] — 软删除技能（仅删除无绑定的技能） */
export const DELETE = withRBAC<RouteParams>(async (request: Request, ctx: WorkspaceContext, { params }) => {
  const { id } = await params
  const skill = await getSkillById(id)
  if (!skill) return errorResponse("技能不存在", 404)
  if (skill.workspaceId !== ctx.workspaceId) return errorResponse("无权访问该技能", 403)
  if (skill.source === "BUILTIN") return errorResponse("内置技能不可删除", 403)

  // 客户端可传 force=true 强制删除
  const url = new URL(request.url)
  const force = url.searchParams.get("force") === "true"

  const actor = await actorFromSession()
  const auditEntry = await createAuditEntry({
    actor, action: "skill.delete", targetType: "skill", targetId: id,
    detail: `${force ? "强制" : ""}删除技能: ${skill.name}`, riskLevel: "medium",
    workspaceId: ctx.workspaceId,
    automationLevel: (skill.automationLevel ?? "L2") as "L1" | "L2" | "L3" | "L4",
    triggeredBy: "user"
  })
  try {
    if (skill.source === "EXTERNAL") {
      try {
        const { uninstallPack } = await import("@/lib/server/industry-pack-loader")
        await uninstallPack(`pack-${skill.name}`, "1.0.0", ctx.workspaceId, ctx.userId || "system")
      } catch (packErr) {
        logger.warn(`联动卸载外部技能 [${skill.name}] 关联的行业包失败`, { error: String(packErr) })
      }
    }
    await deleteSkillRecord(id, force)
    await updateAuditEntry({ auditId: auditEntry.auditId, status: "success" })
    return successResponse({ message: `技能「${skill.name}」已删除` })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "删除失败"
    await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed", detail: msg })
    if (msg.includes("智能体使用")) {
      return errorResponse(msg, 409)
    }
    return errorResponse("删除技能失败")
  }
}, "MEMBER")

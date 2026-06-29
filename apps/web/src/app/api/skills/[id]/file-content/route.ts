import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { withRBAC } from "@/lib/server/api-handler"
import type { RouteContext } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { getSkillById } from "@/lib/server/skills"
import * as fs from "fs"
import * as path from "path"

type RouteParams = { params: Promise<{ id: string }> }

function getSkillDirectory(skillId: string, skillName: string): string | null {
  const commandName = skillId.startsWith("skill-") ? skillId.substring(6) : skillId
  const candidates = [
    path.join(process.cwd(), ".agents", "skills", skillName),
    path.join(process.cwd(), "..", ".agents", "skills", skillName),
    path.join(process.cwd(), ".agents", "skills", commandName),
    path.join(process.cwd(), "..", ".agents", "skills", commandName),
    path.join(process.cwd(), ".claude", "skills", commandName),
    path.join(process.cwd(), "..", ".claude", "skills", commandName),
    path.join("C:\\Users\\frankfeny\\.gemini\\config\\plugins\\science\\skills", skillName),
    path.join("C:\\Users\\frankfeny\\.gemini\\config\\plugins\\science\\skills", commandName)
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate
    }
  }
  return null
}

/** GET /api/skills/[id]/file-content?path=SKILL.md — 获取技能下具体文件内容 */
export const GET = withRBAC<RouteParams>(async (request: Request, ctx: WorkspaceContext, { params }) => {
  const { id } = await params
  const url = new URL(request.url)
  const filePathParam = url.searchParams.get("path")

  if (!filePathParam) {
    return errorResponse("缺少 path 参数", 400)
  }

  const skill = await getSkillById(id)
  if (!skill) return errorResponse("技能不存在", 404)
  if (skill.workspaceId !== ctx.workspaceId) return errorResponse("无权访问该技能", 403)

  // 安全检查：防止路径穿透攻击
  const normPath = path.normalize(filePathParam)
  if (normPath.startsWith("..") || path.isAbsolute(normPath)) {
    return errorResponse("非法的路径参数", 400)
  }

  const skillDir = getSkillDirectory(skill.id, skill.name)
  if (skillDir) {
    const fullPath = path.resolve(skillDir, normPath)
    if (fullPath.startsWith(skillDir) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8")
        return successResponse({ content })
      } catch (err) {
        logger.error(`Failed to read file: ${fullPath}`, { error: String(err) })
      }
    }
  }

  // 兜底：如果是读取 SKILL.md，但磁盘上不存在，返回数据库里的 skillMdContent
  if (normPath === "SKILL.md" && skill.skillMdContent) {
    return successResponse({ content: skill.skillMdContent })
  }

  return errorResponse("文件不存在", 404)
}, "MEMBER")

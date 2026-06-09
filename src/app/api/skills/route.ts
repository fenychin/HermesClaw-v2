import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import { parseJsonField, successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"

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

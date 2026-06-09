import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  parseJsonField,
  stringifyJsonField,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { AgentCreateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext } from "@/lib/workspace"

/**
 * 智能体序列化：将数据库 JSON 字符串字段反序列化为对象/数组
 */
function serializeAgent(agent: Record<string, unknown>) {
  return {
    ...agent,
    category: parseJsonField(agent.category as string, []),
    bindSkills: parseJsonField(agent.bindSkills as string, []),
    bindConnectors: parseJsonField(agent.bindConnectors as string, []),
    canDo: parseJsonField(agent.canDo as string, []),
    cannotDo: parseJsonField(agent.cannotDo as string, []),
    statsJson: parseJsonField(agent.statsJson as string, {}),
  }
}

/** GET /api/agents —— 获取当前 workspace 的智能体列表 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const agents = await prisma.agent.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
    })
    return successResponse({ agents: agents.map(serializeAgent) })
  } catch (error) {
    logger.error('GET /api/agents: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** POST /api/agents —— 创建新智能体 */
export async function POST(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, AgentCreateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const agent = await prisma.agent.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId: ctx.workspaceId,
        name: body.name,
        role: body.role,
        description: body.description,
        status: body.status,
        source: body.source,
        category: stringifyJsonField(body.category),
        bindSkills: stringifyJsonField(body.bindSkills),
        bindConnectors: stringifyJsonField(body.bindConnectors),
        memoryPermission: body.memoryPermission,
        harnessVersion: body.harnessVersion,
        canDo: stringifyJsonField(body.canDo),
        cannotDo: stringifyJsonField(body.cannotDo),
        statsJson: stringifyJsonField(body.statsJson),
        lastActive: body.lastActive,
      },
    })

    await writeAuditLog({
      actor: await actorFromSession(),
      action: "create.agent",
      targetType: "agent",
      targetId: agent.id,
      detail: `${agent.name} · ${agent.role}`,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
    })

    return successResponse({ agent: serializeAgent(agent as unknown as Record<string, unknown>) }, 201)
  } catch (error) {
    logger.error('POST /api/agents: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

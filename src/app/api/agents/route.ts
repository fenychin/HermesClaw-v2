import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  stringifyJsonField,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { actorFromSession } from "@/lib/server/audit"
import { AgentCreateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"
import { serializeAgent } from "@/lib/server/agent-serializer"

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
    requireWritable(ctx.role)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, AgentCreateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const agentId = crypto.randomUUID()
    const actor = await actorFromSession()

    // Prisma 事务：创建 + 审计写入原子执行（AGENTS.md §5 #3 无日志禁止静默执行）
    const [agent] = await prisma.$transaction([
      prisma.agent.create({
        data: {
          id: agentId,
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
          automationLevel: body.automationLevel,
          canDo: stringifyJsonField(body.canDo),
          cannotDo: stringifyJsonField(body.cannotDo),
          statsJson: stringifyJsonField(body.statsJson),
          lastActive: body.lastActive,
        },
      }),
      prisma.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          actor,
          action: "agent.create",
          targetType: "agent",
          targetId: agentId,
          detail: `${body.name} · ${body.role}`,
          riskLevel: "low",
          workspaceId: ctx.workspaceId,
        },
      }),
    ])

    return successResponse({ agent: serializeAgent(agent as unknown as Record<string, unknown>) }, 201)
  } catch (error) {
    logger.error('POST /api/agents: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger'
import { stringifyJsonField } from "@/lib/api-utils"
import { withRBAC } from '@/lib/server/api-handler'
import { ApiResponse } from '@/lib/server/api-response'
import { AgentCreateSchema, validateBody } from "@/lib/server/validators"
import { ForbiddenError, requireWritable } from "@/lib/workspace"
import { serializeAgent } from "@/lib/server/agent-serializer"

/** GET /api/agents —— 获取智能体列表，支持分页与状态筛选 */
export const GET = withRBAC(
  async (req: Request, ctx: any) => {
    try {
      const { searchParams } = new URL(req.url)
      const status = searchParams.get('status')
      const pageStr = searchParams.get('page') || '1'
      const limitStr = searchParams.get('limit') || '20'
      const page = parseInt(pageStr, 10)
      const limit = parseInt(limitStr, 10)

      const whereClause: any = {
        workspaceId: ctx.workspaceId
      }
      if (status) {
        whereClause.status = status
      }

      const agents = await prisma.agent.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      })

      // 一次性聚合查询所有智能体已完成的工作流运行数，避免 N+1
      const completedRuns = await prisma.workflowRun.groupBy({
        by: ['agentId'],
        where: {
          workspaceId: ctx.workspaceId,
          status: 'completed',
          agentId: { in: agents.map(a => a.id) }
        },
        _count: {
          id: true
        }
      })
      const completedCountMap = new Map(completedRuns.map(r => [r.agentId, r._count.id]))

      const data = agents.map(agent => {
        let skillCount = 0
        let connectorCount = 0
        let tags: string[] = []
        try {
          const skills = JSON.parse(agent.bindSkills || '[]')
          skillCount = Array.isArray(skills) ? skills.length : 0
          tags = Array.isArray(skills) ? skills : []
        } catch {}
        try {
          const connectors = JSON.parse(agent.bindConnectors || '[]')
          connectorCount = Array.isArray(connectors) ? connectors.length : 0
        } catch {}

        const taskCount = completedCountMap.get(agent.id) || 0

        const serialized = serializeAgent(agent as unknown as Record<string, unknown>)
        return {
          ...serialized,
          tags,
          skillCount,
          connectorCount,
          taskCount, // 返回真实的已完成任务数
          lastActiveAt: agent.lastActive
        }
      })

      return ApiResponse.ok({ agents: data })
    } catch (error) {
      logger.error('GET /api/agents: 失败', { error: error instanceof Error ? error.message : '未知错误' })
      return ApiResponse.apiError("服务器内部错误", 500)
    }
  },
  'MEMBER'
)

/** POST /api/agents —— 创建新智能体 */
export const POST = withRBAC(
  async (req: Request, ctx: any) => {
    try {
      requireWritable(ctx.role)
      const rawBody = await req.json()
      const parsed = validateBody(rawBody, AgentCreateSchema)
      if (parsed instanceof Response) return parsed
      const body = parsed

      const agentId = crypto.randomUUID()
      const actor = ctx.userId || 'system'

      // Prisma 事务：创建 + 审计写入原子执行
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

      return ApiResponse.ok({ agent: serializeAgent(agent as unknown as Record<string, unknown>) })
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return ApiResponse.apiError(error.message, 403, 'FORBIDDEN')
      }
      logger.error('POST /api/agents: 失败', { error: error instanceof Error ? error.message : '未知错误' })
      return ApiResponse.apiError("服务器内部错误", 500)
    }
  },
  'MEMBER'
)


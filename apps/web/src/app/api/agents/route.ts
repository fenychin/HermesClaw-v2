import { prisma } from "@/lib/prisma"; import { logger } from '@/lib/logger'
import { stringifyJsonField } from "@/lib/api-utils"; import { withRBAC } from '@/lib/server/api-handler'
import { ApiResponse } from '@/lib/server/api-response'
import { AgentCreateSchema, validateBody } from "@/lib/server/validators"
import { ForbiddenError, requireWritable } from "@/lib/workspace"
import { serializeAgent } from "@/lib/server/agent-serializer"; import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"

export const GET = withRBAC(async (req: Request, ctx: any) => {
  try {
    const { searchParams } = new URL(req.url); const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1', 10); const limit = parseInt(searchParams.get('limit') || '20', 10)
    const skillId = searchParams.get('skillId')
    const whereClause: any = { workspaceId: ctx.workspaceId }; if (status) whereClause.status = status

    // 按 skillId 过滤：通过 SkillBinding 关联表查找已绑定该技能的 Agent
    if (skillId) {
      const bindings = await prisma.skillBinding.findMany({
        where: { skillId, workspaceId: ctx.workspaceId },
        select: { agentId: true },
      })
      const agentIds = bindings.map((b: { agentId: string }) => b.agentId)
      if (agentIds.length === 0) {
        return ApiResponse.ok({ agents: [] })
      }
      whereClause.id = { in: agentIds }
    }

    const agents = await prisma.agent.findMany({ where: whereClause, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: "desc" } })
    const completedRuns = await prisma.workflowRun.groupBy({ by: ['agentId'], where: { workspaceId: ctx.workspaceId, status: 'completed', agentId: { in: agents.map((a: any) => a.id) } }, _count: { id: true } })
    const completedCountMap = new Map(completedRuns.map((r: any) => [r.agentId, r._count.id]))
    const data = agents.map((agent: any) => {
      let skillCount = 0, connectorCount = 0, tags: string[] = []
      try { const s = JSON.parse(agent.bindSkills || '[]'); skillCount = Array.isArray(s) ? s.length : 0; tags = Array.isArray(s) ? s : [] } catch {}
      try { connectorCount = JSON.parse(agent.bindConnectors || '[]').length } catch {}
      return { ...serializeAgent(agent as unknown as Record<string, unknown>), tags, skillCount, connectorCount, taskCount: completedCountMap.get(agent.id) || 0, lastActiveAt: agent.lastActive }
    })
    return ApiResponse.ok({ agents: data })
  } catch (error) { logger.error('GET /api/agents: 失败', { error: error instanceof Error ? error.message : '未知错误' }); return ApiResponse.apiError("服务器内部错误", 500) }
}, 'VIEWER')

export const POST = withRBAC(async (req: Request, ctx: any) => {
  try {
    requireWritable(ctx.role); const rawBody = await req.json()
    const parsed = validateBody(rawBody, AgentCreateSchema)
    if (parsed instanceof Response) return parsed; const body = parsed
    const agentId = crypto.randomUUID()
    const actor = await actorFromSession()
    
    // 配置与边界变更二阶段审计：预记录 pending
    const auditEntry = await createAuditEntry({
      actor,
      action: "agent.create",
      targetType: "agent",
      targetId: agentId,
      detail: `创建智能体: ${body.name}`,
      riskLevel: "medium",
      workspaceId: ctx.workspaceId,
      automationLevel: body.automationLevel as any,
      triggeredBy: "user",
      contextSnapshot: {
        name: body.name,
        role: body.role,
        automationLevel: body.automationLevel,
        bindSkills: body.bindSkills,
        bindConnectors: body.bindConnectors
      }
    })

    try {
      const [agent] = await prisma.$transaction([prisma.agent.create({ data: { id: agentId, workspaceId: ctx.workspaceId, name: body.name, role: body.role, description: body.description, status: body.status, source: body.source, category: stringifyJsonField(body.category), bindSkills: stringifyJsonField(body.bindSkills), bindConnectors: stringifyJsonField(body.bindConnectors), memoryPermission: body.memoryPermission, harnessVersion: body.harnessVersion, automationLevel: body.automationLevel, canDo: stringifyJsonField(body.canDo), cannotDo: stringifyJsonField(body.cannotDo), statsJson: stringifyJsonField(body.statsJson), lastActive: body.lastActive } })])
      
      if (auditEntry.ok) {
        await updateAuditEntry({
          auditId: auditEntry.auditId,
          status: "success",
          detail: `成功创建智能体: ${body.name}`
        })
      }
      return ApiResponse.ok({ agent: serializeAgent(agent as unknown as Record<string, unknown>) })
    } catch (err: any) {
      if (auditEntry.ok) {
        await updateAuditEntry({
          auditId: auditEntry.auditId,
          status: "failed",
          detail: `创建智能体失败: ${err instanceof Error ? err.message : "未知错误"}`
        })
      }
      throw err
    }
  } catch (error) { if (error instanceof ForbiddenError) return ApiResponse.apiError(error.message, 403, 'FORBIDDEN'); logger.error('POST /api/agents: 失败', { error: error instanceof Error ? error.message : '未知错误' }); return ApiResponse.apiError("服务器内部错误", 500) }
}, 'MEMBER')

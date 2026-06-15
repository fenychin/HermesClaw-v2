/**
 * /api/agents/[id]/logs —— 指定智能体的运行日志读写
 *
 * GET：按 createdAt 倒序返回该 Agent 最近 50 条日志（真实 prisma.agentLog）。
 * POST：写入一条新运行日志（AGENTS.md 4.4 闭环反馈 / 第五章「无日志的执行属违规」）。
 *
 * 复杂业务逻辑下沉至 @/lib/server/agent-log（CLAUDE.md 约定），
 * 本 Handler 只做 I/O 与入参校验。
 */
import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"
import { writeAgentLog } from "@/lib/server/agent-log"
import { AgentLogCreateSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"

/** 单次查询返回的日志条数上限 */
const LOGS_LIMIT = 50

/** GET /api/agents/[id]/logs —— 查询该智能体的运行日志（倒序，最多 50 条） */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)

    const agent = await prisma.agent.findUnique({ where: { id, workspaceId: ctx.workspaceId } })
    if (!agent) {
      return errorResponse("智能体不存在", 404)
    }

    const logs = await prisma.agentLog.findMany({
      where: { agentId: id, workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      take: LOGS_LIMIT,
    })

    return successResponse({ logs })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return errorResponse(error.message, 403)
    }
    logger.error('GET /api/agents/[id]/logs: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** POST /api/agents/[id]/logs —— 写入一条运行日志（需写权限，AGENTS.md §4.11） */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)

    const agent = await prisma.agent.findUnique({
      where: { id, workspaceId: ctx.workspaceId },
    })
    if (!agent) {
      return errorResponse("智能体不存在", 404)
    }

    const rawBody = await request.json()
    const parsed = validateBody(rawBody, AgentLogCreateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    await writeAgentLog({
      agentId: id,
      source: "agent",
      taskName: body.taskName,
      status: body.status,
      duration: body.duration,
      detail: body.detail,
    })

    return successResponse({ message: "日志已写入" }, 201)
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return errorResponse(error.message, 403)
    }
    logger.error('POST /api/agents/[id]/logs: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

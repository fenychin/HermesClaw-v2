import { prisma } from "@/lib/prisma"; import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { writeAgentLog } from "@/lib/server/agent-log"
import { AgentLogCreateSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const ctx = await buildWorkspaceContext(request)
    const agent = await prisma.agent.findUnique({ where: { id, workspaceId: ctx.workspaceId } })
    if (!agent) return errorResponse("智能体不存在", 404)
    const logs = await prisma.agentLog.findMany({ where: { agentId: id, workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" }, take: 50 })
    return successResponse({ logs })
  } catch (error) { if (error instanceof ForbiddenError) return errorResponse(error.message, 403); logger.error('GET /api/agents/[id]/logs: 失败'); return errorResponse("服务器内部错误") }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role)
    const agent = await prisma.agent.findUnique({ where: { id, workspaceId: ctx.workspaceId } })
    if (!agent) return errorResponse("智能体不存在", 404)
    const rawBody = await request.json(); const parsed = validateBody(rawBody, AgentLogCreateSchema)
    if (parsed instanceof Response) return parsed; const body = parsed
    await writeAgentLog({ agentId: id, source: "agent", taskName: body.taskName, status: body.status, duration: body.duration, detail: body.detail })
    return successResponse({ message: "日志已写入" }, 201)
  } catch (error) { if (error instanceof ForbiddenError) return errorResponse(error.message, 403); logger.error('POST /api/agents/[id]/logs: 失败'); return errorResponse("服务器内部错误") }
}

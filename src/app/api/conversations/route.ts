import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { ConversationCreateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"
import { actorFromSession } from "@/lib/server/shared/audit"
import { auditedWrite } from "@/lib/server/shared/audited-write"
import { writeAgentLog } from "@/lib/server/shared/agent-log"

/** GET /api/conversations —— 获取对话列表 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const conversations = await prisma.conversation.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { messages: true } },
      },
    })

    return successResponse({ conversations })
  } catch (error) {
    logger.error('GET /api/conversations: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** POST /api/conversations —— 创建新对话 */
export async function POST(request: Request) {
  // 计时供 AgentLog 闭环反馈（AGENTS.md §4.4）
  const start = Date.now()
  const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`
  try {
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, ConversationCreateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    // 预生成对话 ID，使审计 targetId 从预记录起即指向真实对话（AGENTS.md §4.3 可溯源 / §1.2 数据主权）
    const conversationId = crypto.randomUUID()
    const actor = await actorFromSession()

    // 预记录审计 + 写库 + 成功/失败回填，统一经 auditedWrite（§4.3 / §5 #3）
    const conversation = await auditedWrite(
      {
        actor,
        action: "conversation.create",
        targetType: "conversation",
        targetId: conversationId,
        riskLevel: "low",
        automationLevel: "L2",
        triggeredBy: "user",
        workspaceId: ctx.workspaceId,
        detail: `创建对话: ${body.title}`,
      },
      () =>
        prisma.conversation.create({
          data: {
            id: conversationId,
            workspaceId: ctx.workspaceId,
            title: body.title,
            projectId: body.projectId,
            // 优先批量 messages[]（原子回放），其次单条 initialMessage（向后兼容）
            messages:
              body.messages && body.messages.length > 0
                ? {
                    create: body.messages.map((m) => ({
                      id: crypto.randomUUID(),
                      workspaceId: ctx.workspaceId,
                      role: m.role,
                      content: m.content,
                    })),
                  }
                : body.initialMessage
                  ? {
                      create: {
                        id: crypto.randomUUID(),
                        workspaceId: ctx.workspaceId,
                        role: "user",
                        content: body.initialMessage,
                      },
                    }
                  : undefined,
          },
          include: {
            _count: { select: { messages: true } },
          },
        }),
      { onSuccess: (c) => ({ detail: `对话已创建: ${c.id}` }) },
    )

    // 运行日志（§4.4 闭环反馈）
    void writeAgentLog({
      source: "conversation",
      taskName: "对话创建",
      status: "success",
      duration: elapsed(),
      detail: conversation.title,
      riskLevel: "low",
    })

    return successResponse({ conversation }, 201)
  } catch (error) {
    // 权限不足（VIEWER 写）：返回 403，不记执行失败日志（未实际尝试创建）
    if (error instanceof ForbiddenError) {
      return errorResponse(error.message, 403)
    }
    logger.error('POST /api/conversations: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    void writeAgentLog({
      source: "conversation",
      taskName: "对话创建",
      status: "error",
      duration: elapsed(),
      detail: error instanceof Error ? error.message : "对话创建失败",
    })
    return errorResponse("服务器内部错误")
  }
}

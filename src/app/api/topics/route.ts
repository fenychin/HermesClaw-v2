import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { type WorkspaceContext } from "@/lib/workspace"
import { actorFromSession } from "@/lib/server/audit"
import { auditedWrite } from "@/lib/server/audited-write"
import { writeAgentLog } from "@/lib/server/agent-log"
import { withRBAC } from "@/lib/server/api-handler"
import { validateBody } from "@/lib/validators"
import { truncateTitle } from "@/lib/utils"
import { z } from "zod"

/** 新话题创建 Schema —— PRD §10.2 超级入口 */
const TopicCreateSchema = z.object({
  content: z.string().min(1).max(100000),
  attachments: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        url: z.string().url().max(2000),
        size: z.number().positive().max(100 * 1024 * 1024).optional(),
        type: z.string().max(100).optional(),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  agentId: z.string().max(100).nullable().optional().default(null),
  projectId: z.string().uuid().nullable().optional().default(null),
  // 附加元信息（命令类型、系统提示词等）
  meta: z
    .object({
      command: z.string().max(200).optional(),
      systemPrompt: z.string().max(50000).optional(),
    })
    .optional()
    .default({}),
})

/**
 * POST /api/topics —— 创建新话题（超级入口）
 * —— 接收 { content, attachments, agentId?, projectId? }，
 *    写入 Conversation + 初始消息，写审计日志与 AgentLog（AGENTS.md §4.3 / §5 #3）。
 *    RBAC 由 withRBAC 统一守卫（自动 RBAC_DENIED 审计 + 403 响应）。
 */
export const POST = withRBAC(async (
  request: Request,
  ctx: WorkspaceContext,
) => {
  const start = Date.now()
  const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`

  try {
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, TopicCreateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    // 生成对话标题（截取内容前 50 字）
    const title = truncateTitle(body.content)

    const conversationId = crypto.randomUUID()
    const actor = await actorFromSession()

    // 构建附件引用文本（附加到消息内容末尾）
    const attachmentText = body.attachments.length > 0
      ? "\n\n📎 附件:\n" + body.attachments.map(
          (a: { name: string; url: string }) => `- [${a.name}](${a.url})`,
        ).join("\n")
      : ""

    const fullContent = body.content + attachmentText

    // 审计写操作（AGENTS.md §4.3 -> auditedWrite 统一封装）
    const conversation = await auditedWrite(
      {
        actor,
        action: "topic.create",
        targetType: "conversation",
        targetId: conversationId,
        riskLevel: "low",
        automationLevel: "L2",
        triggeredBy: "user",
        workspaceId: ctx.workspaceId,
        detail: `新话题: ${title}`,
        contextSnapshot: {
          hasAttachments: body.attachments.length > 0,
          attachmentCount: body.attachments.length,
          hasAgent: !!body.agentId,
          agentId: body.agentId ?? null,
          hasCommand: !!body.meta.command,
          command: body.meta.command ?? null,
        },
      },
      () =>
        prisma.conversation.create({
          data: {
            id: conversationId,
            workspaceId: ctx.workspaceId,
            title,
            projectId: body.projectId ?? null,
            messages: {
              create: {
                id: crypto.randomUUID(),
                workspaceId: ctx.workspaceId,
                role: "user",
                content: fullContent,
              },
            },
          },
          include: {
            _count: { select: { messages: true } },
          },
        }),
      {
        onSuccess: (c) => ({
          detail: `话题已创建: ${c.id}`,
          contextSnapshot: { conversationId: c.id, title },
        }),
      },
    )

    // 运行日志（AGENTS.md §4.4 闭环反馈）
    void writeAgentLog({
      source: "conversation",
      taskName: "新话题创建",
      status: "success",
      duration: elapsed(),
      detail: title,
      riskLevel: "low",
    })

    return successResponse(
      {
        topic: {
          id: conversation.id,
          title: conversation.title,
          projectId: conversation.projectId,
          messageCount: conversation._count.messages,
          createdAt: conversation.createdAt.toISOString(),
          updatedAt: conversation.updatedAt.toISOString(),
        },
      },
      201,
    )
  } catch (error) {
    logger.error('POST /api/topics: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    void writeAgentLog({
      source: "conversation",
      taskName: "新话题创建",
      status: "error",
      duration: elapsed(),
      detail: error instanceof Error ? error.message : "话题创建失败",
    })
    return errorResponse("服务器内部错误")
  }
}, "MEMBER")

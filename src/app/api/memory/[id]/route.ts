import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  serializeMemory,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { checkConfirmValue, checkAutomationGate } from "@/lib/server/guardrail"
import { shouldVersion, snapshotRevision } from "@/lib/server/memory-version"
import { MemoryUpdateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"

/** GET /api/memory/[id] —— 获取单条记忆详情 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const memory = await prisma.memory.findUnique({
      where: { id },
      include: { project: true },
    })

    if (!memory) {
      return errorResponse("记忆不存在", 404)
    }

    return successResponse({ memory: serializeMemory(memory as unknown as Record<string, unknown>) })
  } catch (error) {
    logger.error('GET /api/memory/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** PATCH /api/memory/[id] —— 冻结/解冻 或 升级记忆类型 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, MemoryUpdateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const existing = await prisma.memory.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse("记忆不存在", 404)
    }

    // frozen 记忆的内容性改动属高危（核心资产）：须二次确认（AGENTS.md 4.5）
    const isContentChange =
      body.content !== undefined ||
      body.summary !== undefined ||
      body.confidence !== undefined
    if (existing.frozen && isContentChange) {
      const guard = await checkConfirmValue(
        body.confirm,
        "修改已冻结记忆（核心资产）需二次确认",
      )
      if (!guard.ok) return guard.response
    }

    const data: Record<string, unknown> = {}

    // 冻结/解冻
    if (body.frozen !== undefined) {
      data.frozen = body.frozen
    }

    // 升级记忆类型：mid → long
    if (body.type !== undefined) {
      const validTypes = ["short", "mid", "long"]
      if (!validTypes.includes(body.type)) {
        return errorResponse(`无效的记忆类型: ${body.type}，有效值: ${validTypes.join(", ")}`, 400)
      }
      data.type = body.type
    }

    // 支持更新内容
    if (body.content !== undefined) data.content = body.content
    if (body.summary !== undefined) data.summary = body.summary
    if (body.confidence !== undefined) data.confidence = body.confidence

    // 知识版本化（P2-⑧）：mid/long 内容性变更先快照旧版本再 bump version
    if (shouldVersion(existing.type, body)) {
      const newVersion = await snapshotRevision(
        {
          id: existing.id,
          version: existing.version,
          content: existing.content,
          summary: existing.summary,
          confidence: existing.confidence,
        },
        await actorFromSession(),
        body.reason,
      )
      data.version = newVersion
    }

    const memory = await prisma.memory.update({
      where: { id },
      data,
    })

    return successResponse({ memory: serializeMemory(memory as unknown as Record<string, unknown>) })
  } catch (error) {
    logger.error('PATCH /api/memory/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** DELETE /api/memory/[id] —— 删除记忆（需 ?confirm=true） */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)

    const existing = await prisma.memory.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse("记忆不存在", 404)
    }

    // 删除持久化数据 = 高危操作，永远需要人工审批（AGENTS.md §4.5）
    // L3 门禁：需 ?confirm=true 二次确认；L4 硬拒绝
    const gate = await checkAutomationGate({
      automationLevel: "L3",
      riskLevel: "high",
      confirmed: new URL(request.url).searchParams.get("confirm") === "true",
      actionName: `删除记忆：${existing.summary}`,
    })
    if (!gate.ok) return gate.response

    await prisma.memory.delete({ where: { id } })

    await writeAuditLog({
      actor: gate.actor,
      action: "delete.memory",
      targetType: "memory",
      targetId: id,
      detail: `${existing.type} · ${existing.summary}`,
      riskLevel: "mid",
      workspaceId: ctx.workspaceId,
    })

    return successResponse({ message: "记忆已删除" })
  } catch (error) {
    logger.error('DELETE /api/memory/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

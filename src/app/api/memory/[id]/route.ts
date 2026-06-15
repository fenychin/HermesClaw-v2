import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  serializeMemory,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { checkConfirmValue, checkAutomationGate } from "@/lib/server/guardrail"
import { MemoryService } from "@/lib/server/memory-service"
import { MemoryUpdateSchema, validateBody } from "@/lib/server/validators"
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

    if (body.frozen !== undefined) data.frozen = body.frozen

    if (body.type !== undefined) {
      const validTypes = ["short", "mid", "long"]
      if (!validTypes.includes(body.type)) {
        return errorResponse(`无效的记忆类型: ${body.type}，有效值: ${validTypes.join(", ")}`, 400)
      }
      data.type = body.type
    }

    if (body.content !== undefined) data.content = body.content
    if (body.summary !== undefined) data.summary = body.summary
    if (body.confidence !== undefined) data.confidence = body.confidence
    if (body.reason !== undefined) data.reason = body.reason
    if (body.tags !== undefined) data.tags = body.tags

    const actor = await actorFromSession()
    const memory = await MemoryService.updateMemory(
      existing.workspaceId,
      id,
      data,
      actor
    )

    return successResponse({ memory: serializeMemory(memory as unknown as Record<string, unknown>) })
  } catch (error) {
    logger.error('PATCH /api/memory/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}


/** PUT /api/memory/[id] —— 更新记忆内容，自动生成 MemoryRevision */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)
    const rawBody = await request.json()

    const existing = await prisma.memory.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse("记忆不存在", 404)
    }

    if (existing.workspaceId !== ctx.workspaceId) {
      return errorResponse("无权访问此记忆", 403)
    }

    const actor = await actorFromSession()
    
    // 如果没有传入 summary，我们可以自动根据新 content 生成一个新的简短 summary
    const summary = rawBody.content 
      ? (rawBody.content.length > 50 ? rawBody.content.substring(0, 50) + "..." : rawBody.content)
      : existing.summary

    const updated = await MemoryService.updateMemory(
      existing.workspaceId,
      id,
      {
        content: rawBody.content,
        summary: summary,
        tags: rawBody.tags,
        reason: rawBody.reason || "手动编辑更新",
      },
      actor
    )

    // 写入 memory.updated 审计日志
    await writeAuditLog({
      actor,
      action: "memory.updated",
      targetType: "memory",
      targetId: id,
      detail: `更新记忆内容并生成新版本 (v${updated.version}): ${updated.summary}`,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
    }).catch(() => {})

    const revisionCount = await prisma.memoryRevision.count({
      where: { memoryId: id }
    })

    const parsedTags = (() => {
      try {
        return JSON.parse(updated.tags || "[]")
      } catch {
        return []
      }
    })()

    return successResponse({
      memory: {
        id: updated.id,
        workspaceId: updated.workspaceId,
        projectId: updated.projectId,
        type: updated.type,
        content: updated.content,
        summary: updated.summary,
        source: updated.source,
        tags: parsedTags,
        version: updated.version,
        revisionCount,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      }
    })
  } catch (error) {
    logger.error('PUT /api/memory/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** DELETE /api/memory/[id] —— 软删除记忆（不物理删除） */
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

    if (existing.workspaceId !== ctx.workspaceId) {
      return errorResponse("无权访问此记忆", 403)
    }

    // 删除持久化数据 = 高危操作，永远需要人工审批（AGENTS.md §4.5）
    // L3 门禁：需 ?confirm=true 二次确认；L4 硬拒绝
    const gate = await checkAutomationGate({
      automationLevel: "L3",
      riskLevel: "high",
      confirmed: new URL(request.url).searchParams.get("confirm") === "true",
      actionName: `归档记忆：${existing.summary}`,
    })
    if (!gate.ok) return gate.response

    // 软删除：修改 status 为 archived，禁止物理删除
    await prisma.memory.update({
      where: { id },
      data: { status: "archived" }
    })

    // 写入 memory.archived 审计日志
    await writeAuditLog({
      actor: gate.actor,
      action: "memory.archived",
      targetType: "memory",
      targetId: id,
      detail: `软删除归档记忆条目: ${existing.summary}`,
      riskLevel: "medium",
      workspaceId: ctx.workspaceId,
    }).catch(() => {})

    return successResponse({ message: "记忆已归档（软删除）" })
  } catch (error) {
    logger.error('DELETE /api/memory/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

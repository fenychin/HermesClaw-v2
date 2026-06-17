import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { MemoryCreateSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"
import { guardOutput } from "@/lib/server/output-guard"
import { MemoryService } from "@/lib/server/memory-service"
import { memoryRead, memoryWrite } from "@hermesclaw/hermes-kernel"

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request); const { searchParams } = new URL(request.url)
    const result = await memoryRead(prisma, ctx.workspaceId, {
      scope: searchParams.get("scope"), projectId: searchParams.get("projectId"),
      page: parseInt(searchParams.get("page") || "1", 10), limit: parseInt(searchParams.get("limit") || "30", 10),
    })
    return successResponse(result)
  } catch (error) { logger.error('GET /api/memory: 失败', { error: error instanceof Error ? error.message : '未知错误' }); return errorResponse("服务器内部错误") }
}

export async function POST(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role)
    const rawBody = await request.json()
    if (rawBody.scope) { if (rawBody.scope === "org") rawBody.type = "long"; else if (rawBody.scope === "project") rawBody.type = "mid"; else if (rawBody.scope === "session") rawBody.type = "short" }
    if (!rawBody.summary && rawBody.content) rawBody.summary = rawBody.content.length > 50 ? rawBody.content.substring(0, 50) + "..." : rawBody.content
    const parsed = validateBody(rawBody, MemoryCreateSchema)
    if (parsed instanceof Response) return parsed; const body = parsed
    const guard = guardOutput(body.content, { minLength: 3, maxLength: 8000 })
    if (!guard.ok) return errorResponse(`知识库文本不合规：${guard.reason}`, 400)
    const actor = await actorFromSession()
    const memory = await memoryWrite(async (_workspaceId, data, act) => MemoryService.createMemory(_workspaceId, data, act), ctx.workspaceId, { type: body.type, content: body.content, summary: body.summary, source: body.source || "manual", relatedProject: body.relatedProject, relatedAgent: body.relatedAgent, confidence: body.confidence, frozen: body.frozen, tags: body.tags, projectId: body.projectId }, actor)
    void writeAuditLog({ actor, action: "memory.created", targetType: "memory", targetId: memory.id, detail: `手动创建记忆条目 (${memory.type}): ${memory.summary}`, riskLevel: "low", workspaceId: ctx.workspaceId }).catch(() => {})
    const parsedTags = (() => { try { return JSON.parse(memory.tags || "[]") } catch { return [] } })()
    return successResponse({ memory: { id: memory.id, workspaceId: memory.workspaceId, projectId: memory.projectId, type: memory.type, content: memory.content, summary: memory.summary, source: memory.source, tags: parsedTags, version: memory.version, revisionCount: 1, createdAt: memory.createdAt.toISOString(), updatedAt: memory.updatedAt.toISOString() } }, 201)
  } catch (error) { logger.error('POST /api/memory: 失败', { error: error instanceof Error ? error.message : '未知错误' }); return errorResponse("服务器内部错误") }
}

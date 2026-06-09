/**
 * POST /api/tools/grant —— 为智能体签发工具短期授权（AGENTS.md 4.3）
 *
 * 请求体：{ toolId, agentId, scopes?, approvedBy1?, approvedBy2? }
 *   高危工具（riskLevel=high）须提供两个不同审批者。
 * 响应：{ grant: { token, expiresAt, ... } }（Token ≤15min 有效）
 */
import { issueToolGrant } from "@/lib/server/tool-registry"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { ToolGrantSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, ToolGrantSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const actor = await actorFromSession()
    const result = await issueToolGrant({
      toolId: body.toolId,
      agentId: body.agentId,
      scopes: body.scopes,
      issuedBy: actor,
      approvedBy1: body.approvedBy1,
      approvedBy2: body.approvedBy2,
    })

    if (!result.ok) {
      return errorResponse(result.error ?? "授权失败", 400)
    }

    await writeAuditLog({
      actor,
      action: "grant.tool",
      targetType: "tool",
      targetId: body.toolId,
      detail: `授予 ${body.agentId}，有效至 ${result.grant?.expiresAt}`,
      riskLevel: "mid",
      workspaceId: ctx.workspaceId,
    })

    return successResponse({ grant: result.grant }, 201)
  } catch (error) {
    logger.error('POST /api/tools/grant: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

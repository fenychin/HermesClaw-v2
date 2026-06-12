/**
 * POST /api/tools/grant —— 为智能体签发工具短期授权（AGENTS.md 4.3）
 *
 * 请求体：{ toolId, agentId, scopes?, approvedBy1?, approvedBy2? }
 *   高危工具（riskLevel=high）须提供两个不同审批者。
 * 响应：{ grant: { token, expiresAt, ... } }（Token ≤15min 有效）
 *
 * —— AGENTS.md §5 #3 禁止静默执行：授权前写入预记录审计，执行后更新状态。
 */
import { issueToolGrant } from "@/lib/server/tool-registry"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { ToolGrantSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const ctx = await buildWorkspaceContext(request)
  requireWritable(ctx.role)
  const actor = await actorFromSession()

  try {
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, ToolGrantSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    // AGENTS.md §5 #3 禁止静默执行：授权前写入预记录审计
    const entry = await createAuditEntry({
      actor,
      action: "grant.tool",
      targetType: "tool",
      targetId: body.toolId,
      detail: `授予 Agent ${body.agentId}`,
      riskLevel: "mid",
      workspaceId: ctx.workspaceId,
      automationLevel: "L2",
      triggeredBy: "user",
      contextSnapshot: {
        toolId: body.toolId,
        agentId: body.agentId,
        scopes: body.scopes,
        issuedBy: actor,
        hasDualApproval: !!(body.approvedBy1 && body.approvedBy2),
      },
    })

    const result = await issueToolGrant({
      toolId: body.toolId,
      agentId: body.agentId,
      scopes: body.scopes,
      issuedBy: actor,
      approvedBy1: body.approvedBy1,
      approvedBy2: body.approvedBy2,
    })

    if (!result.ok) {
      // 授权失败 → 更新预记录为 failed
      await updateAuditEntry({
        auditId: entry.auditId,
        status: "failed",
        detail: `授权失败: ${result.error ?? "未知原因"}，Agent ${body.agentId}`,
      })
      return errorResponse(result.error ?? "授权失败", 400)
    }

    // 授权成功 → 更新预记录为 success
    await updateAuditEntry({
      auditId: entry.auditId,
      status: "success",
      detail: `授予 ${body.agentId}，有效至 ${result.grant?.expiresAt}`,
      contextSnapshot: {
        grantId: result.grant?.id,
        token: result.grant?.token,
        expiresAt: result.grant?.expiresAt,
        scopes: result.grant?.scopes,
      },
    })

    return successResponse({ grant: result.grant }, 201)
  } catch (error) {
    logger.error('POST /api/tools/grant: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

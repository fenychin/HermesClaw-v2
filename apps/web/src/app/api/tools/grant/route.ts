import { issueToolGrant } from "@/lib/server/tool-registry"; import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { ToolGrantSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role); const actor = await actorFromSession()
  try {
    const rawBody = await request.json(); const parsed = validateBody(rawBody, ToolGrantSchema); if (parsed instanceof Response) return parsed; const body = parsed
    const entry = await createAuditEntry({ actor, action: "grant.tool", targetType: "tool", targetId: body.toolId, detail: `授予 Agent ${body.agentId}`, riskLevel: "medium", workspaceId: ctx.workspaceId, automationLevel: "L2", triggeredBy: "user" })
    const result = await issueToolGrant({ toolId: body.toolId, agentId: body.agentId, scopes: body.scopes, issuedBy: actor, approvedBy1: body.approvedBy1, approvedBy2: body.approvedBy2 })
    if (!result.ok) { await updateAuditEntry({ auditId: entry.auditId, status: "failed", detail: `授权失败: ${result.error}` }); return errorResponse(result.error ?? "授权失败", 400) }
    await updateAuditEntry({ auditId: entry.auditId, status: "success" })
    return successResponse({ grant: result.grant }, 201)
  } catch (error) { logger.error('POST /api/tools/grant: 失败'); return errorResponse("服务器内部错误") }
}

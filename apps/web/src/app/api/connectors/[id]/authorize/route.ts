import { prisma } from "@/lib/prisma"; import { logger } from '@/lib/logger'
import { serializeConnector, successResponse, errorResponse } from "@/lib/api-utils"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { withRBAC } from "@/lib/server/api-handler"; import type { WorkspaceContext } from "@/lib/workspace"
import { z } from "zod"

const AuthorizeSchema = z.object({ code: z.string().min(1), state: z.string().optional(), scopes: z.array(z.string()).optional() })

export const POST = withRBAC<{ params: Promise<{ id: string }> }>(async (request: Request, ctx: WorkspaceContext, { params }) => {
  try {
    const { id } = await params; const rawBody = await request.json().catch(() => null)
    if (!rawBody) return errorResponse("请求体无效", 400)
    const parsed = AuthorizeSchema.safeParse(rawBody)
    if (!parsed.success) return errorResponse(`授权参数校验失败: ${parsed.error.issues.map(i => i.message).join("; ")}`, 400)
    const existing = await prisma.connector.findUnique({ where: { id } })
    if (!existing) return errorResponse("连接器不存在", 404)
    if (existing.workspaceId !== ctx.workspaceId) return errorResponse("无权访问该连接器", 403)
    const actor = await actorFromSession()
    const entry = await createAuditEntry({ actor, action: "connector.authorize", targetType: "connector", targetId: id, detail: existing.name, riskLevel: "medium", workspaceId: ctx.workspaceId, automationLevel: "L2", triggeredBy: "user" })
    try {
      const updated = await prisma.connector.update({ where: { id }, data: { status: "connected", lastSync: new Date().toISOString() } })
      await updateAuditEntry({ auditId: entry.auditId, status: "success", detail: `${existing.name} 授权成功` })
      return successResponse({ message: `连接器「${existing.name}」授权成功`, connector: serializeConnector(updated as any) })
    } catch (error) { await updateAuditEntry({ auditId: entry.auditId, status: "failed", detail: `授权失败: ${error instanceof Error ? error.message : "未知错误"}` }); throw error }
  } catch (error) { logger.error('POST /api/connectors/[id]/authorize: 失败', { error: error instanceof Error ? error.message : '未知错误' }); return errorResponse("连接器授权失败") }
}, "MEMBER")

import { ApiResponse } from "@/lib/server/api-response"
import { logger } from "@/lib/logger"
import { rollbackHarnessProposal, RollbackException } from "@/lib/server/harness/harness-rollback"
import { actorFromSession, createAuditEntry, updateAuditEntry } from "@/lib/server/audit"
import { prisma } from "@/lib/prisma"
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { z } from "zod"
import { validateBody } from "@/lib/server/validators"

const RollbackRequestSchema = z.object({ operatorId: z.string().min(1), confirmationToken: z.string().optional() })
const L3_TOKEN = process.env["HARNESS_L3_CONFIRMATION_TOKEN"] ?? "确认回滚"

export const POST = withRBAC(async (req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
  let preAuditId: string | null = null
  try {
    const { id } = await routeCtx.params
    const parsed = validateBody(await req.json().catch(() => ({})), RollbackRequestSchema); if (parsed instanceof Response) return parsed
    const proposal = await prisma.harnessProposal.findUnique({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true, proposalId: true, status: true, proposedChange: true } })
    if (!proposal) return ApiResponse.error("提案不存在", 404)
    const changeMeta = (proposal.proposedChange ?? {}) as { riskLevel?: string; automationLevel?: string }
    const automationLevel = (changeMeta.automationLevel ?? "L2") as "L1" | "L2" | "L3" | "L4"
    if (automationLevel === "L4") return ApiResponse.error("L4 级别提案禁止自动执行", 403)
    if (automationLevel === "L3" && parsed.confirmationToken !== L3_TOKEN) return Response.json({ success: false, error: "L3 高风险回滚需 confirmationToken", requiresConfirmation: true }, { status: 409 })
    const actor = await actorFromSession()
    const entry = await createAuditEntry({ actor, action: "rollback.proposal", targetType: "proposal", targetId: id, detail: `回滚提案 ${proposal.proposalId}`, riskLevel: "high", workspaceId: ctx.workspaceId, automationLevel, triggeredBy: "user" })
    preAuditId = entry.auditId
    await rollbackHarnessProposal(id, parsed.operatorId)
    await updateAuditEntry({ auditId: entry.auditId, status: "success", detail: `提案 ${proposal.proposalId} 回滚成功` })
    return ApiResponse.ok({ message: "回滚成功" })
  } catch (error) {
    if (preAuditId) await updateAuditEntry({ auditId: preAuditId, status: "failed", detail: `回滚失败: ${error instanceof Error ? error.message : "未知错误"}` }).catch(() => {})
    if (error instanceof RollbackException) return ApiResponse.error(error.message, 409)
    logger.error("POST harness rollback: 失败")
    return ApiResponse.error("回滚失败", 500)
  }
}, "ADMIN")

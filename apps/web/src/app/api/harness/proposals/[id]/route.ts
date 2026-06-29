import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { validateBody } from "@/lib/server/validators"
import { HarnessProposalUpdateSchema } from "@hermesclaw/event-contracts"
import { buildWorkspaceContext, requireHarnessAdmin, type WorkspaceContext } from "@/lib/workspace"
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { findProposalByIdOrAlias, decideProposal, serializeProposal } from "@/lib/server/harness-proposal-service"

export const GET = withRBAC<RouteContext<{ id: string }>>(async (_request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
  try {
    const { id } = await routeCtx.params
    const proposal = await findProposalByIdOrAlias(id, ctx.workspaceId)
    if (!proposal) return errorResponse("提案不存在", 404)
    return successResponse({ proposal: serializeProposal(proposal) })
  } catch (error) { logger.error('GET /api/harness/proposals/[id]: 失败'); return errorResponse("服务器内部错误") }
}, 'VIEWER')

export const PATCH = withRBAC<RouteContext<{ id: string }>>(async (request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
  try {
    const { id } = await routeCtx.params
    const parsed = validateBody(await request.json(), HarnessProposalUpdateSchema); if (parsed instanceof Response) return parsed
    const existing = await findProposalByIdOrAlias(id, ctx.workspaceId)
    if (!existing) return errorResponse("提案不存在", 404)
    if (!parsed.action || !["approve", "reject"].includes(parsed.action)) return errorResponse("无效操作", 400)
    const result = await decideProposal({ 
      existing, 
      action: parsed.action as "approve" | "reject", 
      reviewedBy: parsed.reviewedBy ?? ctx.userId ?? "system", 
      confirm: parsed.confirm === true, 
      workspaceId: ctx.workspaceId 
    })
    if (!result.ok) return result.response
    return successResponse({ proposal: serializeProposal(result.proposal) })
  } catch (error) { 
    logger.error('PATCH /api/harness/proposals/[id]: 失败', error); 
    return errorResponse("服务器内部错误") 
  }
}, 'ADMIN')

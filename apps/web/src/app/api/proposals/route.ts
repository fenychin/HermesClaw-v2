import { prisma } from "@/lib/prisma"; import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { withRBAC } from "@/lib/server/api-handler"; import type { WorkspaceContext } from "@/lib/workspace"

export const GET = withRBAC(async (_request: Request, ctx: WorkspaceContext) => {
  try {
    const proposals = await prisma.harnessProposal.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" } })
    return successResponse({ proposals: proposals.map((p: any) => ({ ...p, evidence: typeof p.evidence === "string" ? JSON.parse(p.evidence) : p.evidence, proposedChange: typeof p.proposedChange === "string" ? JSON.parse(p.proposedChange) : p.proposedChange, affectedAgents: typeof p.affectedAgents === "string" ? JSON.parse(p.affectedAgents) : p.affectedAgents, previousSnapshot: typeof p.previousSnapshot === "string" ? JSON.parse(p.previousSnapshot) : p.previousSnapshot })) })
  } catch (error) { logger.error("GET /api/proposals: 失败"); return errorResponse("服务器内部错误") }
}, "MEMBER")

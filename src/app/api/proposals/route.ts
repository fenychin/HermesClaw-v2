import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { withRBAC } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"

/**
 * GET /api/proposals —— 获取提案列表 (按 workspaceId 过滤)
 *
 * RBAC: MEMBER 及以上（AGENTS.md §4.11 数据隔离 + §6.2 操作可溯源）
 * VIEWER 无权访问提案列表（提案属治理敏感数据）
 */
export const GET = withRBAC(
  async (_request: Request, ctx: WorkspaceContext) => {
    try {
      const proposals = await prisma.harnessProposal.findMany({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" }
      })

      const mapped = proposals.map((p: any) => ({
        ...p,
        evidence:
          typeof p.evidence === "string" ? JSON.parse(p.evidence) : p.evidence,
        proposedChange:
          typeof p.proposedChange === "string"
            ? JSON.parse(p.proposedChange)
            : p.proposedChange,
        affectedAgents:
          typeof p.affectedAgents === "string"
            ? JSON.parse(p.affectedAgents)
            : p.affectedAgents,
        previousSnapshot:
          typeof p.previousSnapshot === "string"
            ? JSON.parse(p.previousSnapshot)
            : p.previousSnapshot,
      }))

      return successResponse({ proposals: mapped })
    } catch (error) {
      logger.error("GET /api/proposals: 失败", {
        error: error instanceof Error ? error.message : "未知错误",
      })
      return errorResponse("服务器内部错误")
    }
  },
  "MEMBER" // 仅 MEMBER 以上可读提案列表（VIEWER 禁止访问）
)

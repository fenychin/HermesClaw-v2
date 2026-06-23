/**
 * GET /api/v1/harness/evolution-proposals — 进化提案列表
 *
 * 返回 EvolutionProposal 列表，支持按 status 过滤。
 * 提案类型限制在 WorkflowTemplate / SkillBinding / EvalRuleSet / MemoryPolicy。
 * 禁止触碰 Guardrail / RBAC / 高危白名单。
 *
 * 三域调用点：[控制域] — 从 Prisma HarnessProposal 映射为 EvolutionProposal 契约。
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { ApiResponse } from "@/lib/server/api-response"
import { buildWorkspaceContext } from "@/lib/workspace"

export const runtime = "nodejs"
export const revalidate = 30

/** 允许的 proposalType：Phase 5 治理边界 */
const ALLOWED_PROPOSAL_TYPES = ["WorkflowTemplate", "SkillBinding", "EvalRuleSet", "MemoryPolicy"] as const

/** DB proposalType → EvolutionProposal targetObjectType 映射 */
const DB_TO_TARGET_TYPE: Record<string, string> = {
  skill_binding: "SkillBinding",
  workflow_template: "WorkflowTemplate",
  memory_policy: "MemoryPolicy",
  eval_rule: "EvalRuleSet",
  connector_policy: "ConnectorPolicy",
}

/** DB severity → riskLevel 映射 */
const SEVERITY_TO_RISK: Record<string, "low" | "medium" | "high" | "critical"> = {
  low: "low",
  medium: "medium",
  high: "high",
  critical: "critical",
}

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get("status")
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100)

    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }

    // 过滤仅允许的提案类型（治理边界）
    const dbTypes = ALLOWED_PROPOSAL_TYPES.map((t) => {
      switch (t) {
        case "WorkflowTemplate": return "workflow_template"
        case "SkillBinding": return "skill_binding"
        case "EvalRuleSet": return "eval_rule"
        case "MemoryPolicy": return "memory_policy"
        default: return ""
      }
    }).filter(Boolean)
    where.proposalType = { in: dbTypes }

    if (statusFilter) {
      where.status = statusFilter
    }

    const proposals = await prisma.harnessProposal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    const total = await prisma.harnessProposal.count({ where })

    // 映射为 EvolutionProposal 格式
    const items = proposals.map((p) => {
      const proposedChange = p.proposedChange as Record<string, unknown> | null
      return {
        proposalId: p.proposalId,
        harnessProposalId: p.id,
        workspaceId: p.workspaceId,
        triggeredBy: p.triggeredBy === "cron.evaluation" ? "auto" : "manual",
        triggerReason: p.triggerReason,
        problemStatement: p.problemStatement,
        evidence: Array.isArray(p.evidence) ? p.evidence.map(String) : [],
        targetComponent: (proposedChange?.targetComponent as string) ?? "进化调度器",
        targetObjectId: p.targetSkillId ?? p.id,
        targetObjectType: DB_TO_TARGET_TYPE[p.proposalType] ?? "EvalRuleSet",
        previousState: p.previousSnapshot ?? undefined,
        proposedState: proposedChange ?? {},
        riskLevel: SEVERITY_TO_RISK[p.severity] ?? "medium",
        automationLevel: (proposedChange?.automationLevel as "L1" | "L2" | "L3" | "L4") ?? "L1",
        requiresHumanApproval: p.requiresHumanApproval,
        estimatedImpact: p.estimatedImpact,
        rollbackPlan: p.rollbackPlan,
        status: mapEvolutionStatus(p.status),
        reviewedBy: p.reviewedBy ?? p.approvedBy ?? null,
        reviewedAt: p.reviewedAt?.toISOString() ?? p.approvedAt?.toISOString() ?? null,
        implementedAt: p.activatedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        version: "1.0.0",
      }
    })

    return ApiResponse.ok({ items, total, limit })
  } catch (error) {
    logger.error("GET /api/v1/harness/evolution-proposals 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return ApiResponse.error("获取进化提案失败", 500)
  }
}

function mapEvolutionStatus(dbStatus: string): "draft" | "pending" | "approved" | "rejected" | "implemented" | "rolled-back" {
  switch (dbStatus) {
    case "draft": return "draft"
    case "pending": return "pending"
    case "approved":
    case "canary":
    case "active":
      return "approved"
    case "rejected": return "rejected"
    case "rolled_back": return "rolled-back"
    default: return "pending"
  }
}

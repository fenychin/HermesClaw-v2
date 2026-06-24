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
const SEVERITY_TO_RISK: Record<string, string> = {
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

    // Fallback: 无 HarnessProposal 数据时，从 A5 WorkflowRun 中提取
    let allSources: Record<string, unknown>[] = proposals.map((p) => ({ ...p }))
    if (allSources.length === 0) {
      const latestA5 = await prisma.workflowRun.findFirst({
        where: { workspaceId: ctx.workspaceId, agentId: "A5", outputContext: { not: null } } as any,
        orderBy: { completedAt: "desc" },
        select: { outputContext: true, completedAt: true, runId: true },
      })
      if (latestA5?.outputContext) {
        try {
          const oc = typeof latestA5.outputContext === "string"
            ? JSON.parse(latestA5.outputContext)
            : latestA5.outputContext
          const evalNode = oc?.["eval-read"]?.output ?? {}
          if (evalNode.title) {
            allSources = [{
              proposalId: `a5-${latestA5.completedAt?.getTime() ?? Date.now()}`,
              id: latestA5.runId,
              workspaceId: ctx.workspaceId,
              triggeredBy: "manual",
              triggerReason: evalNode.rationale ?? evalNode.title ?? "",
              problemStatement: evalNode.rationale ?? evalNode.title ?? "",
              evidence: [],
              proposedChange: {
                description: evalNode.rationale ?? evalNode.title ?? "",
                automationLevel: "L2",
                riskLevel: evalNode.estimatedImpact === "high" ? "high" : "medium",
                targetComponent: "进化调度器",
              },
              targetSkillId: latestA5.runId,
              requiresHumanApproval: true,
              severity: evalNode.estimatedImpact === "high" ? "high" : "medium",
              estimatedImpact: evalNode.estimatedImpact ?? "medium",
              affectedAgents: [],
              rollbackPlan: "回滚到上一版本配置",
              status: "pending",
              reviewedBy: null,
              approvedBy: null,
              reviewedAt: null,
              approvedAt: null,
              rejectedBy: null,
              rejectedAt: null,
              rolledBackBy: null,
              rolledBackAt: null,
              canaryStartedAt: null,
              canaryWindowHours: 24,
              canaryMetrics: null,
              activatedAt: null,
              canaryCompletedAt: null,
              canaryRollbackReason: null,
              previousSnapshot: null,
              createdAt: latestA5.completedAt ?? new Date(),
              updatedAt: latestA5.completedAt ?? new Date(),
            }]
          }
        } catch { /* skip */ }
      }
    }

    const totalFromSources = allSources.length

    // 映射为 EvolutionProposal 格式
    const items = allSources.map((p) => {
      const proposedChange = (p as Record<string, unknown>).proposedChange as Record<string, unknown> | null
      const dbSeverity = (p as Record<string, unknown>).severity as string ?? "medium"
      const createdAt = (p as Record<string, unknown>).createdAt as Date | string
      const updatedAt = (p as Record<string, unknown>).updatedAt as Date | string
      return {
        proposalId: (p as Record<string, unknown>).proposalId as string,
        harnessProposalId: (p as Record<string, unknown>).id as string,
        workspaceId: (p as Record<string, unknown>).workspaceId as string,
        triggeredBy: (p as Record<string, unknown>).triggeredBy === "cron.evaluation" ? "auto" : "manual",
        triggerReason: ((p as Record<string, unknown>).triggerReason as string) ?? "",
        problemStatement: ((p as Record<string, unknown>).problemStatement as string) ?? "",
        evidence: Array.isArray((p as Record<string, unknown>).evidence) ? ((p as Record<string, unknown>).evidence as Array<unknown>).map(String) : [],
        targetComponent: (proposedChange?.targetComponent as string) ?? "进化调度器",
        targetObjectId: ((p as Record<string, unknown>).targetSkillId ?? (p as Record<string, unknown>).id) as string,
        targetObjectType: DB_TO_TARGET_TYPE[(p as Record<string, unknown>).proposalType as string] ?? "EvalRuleSet",
        riskLevel: SEVERITY_TO_RISK[dbSeverity] ?? "medium",
        automationLevel: (proposedChange?.automationLevel as string) ?? "L1",
        requiresHumanApproval: ((p as Record<string, unknown>).requiresHumanApproval as boolean) ?? true,
        estimatedImpact: ((p as Record<string, unknown>).estimatedImpact as string) ?? "medium",
        rollbackPlan: ((p as Record<string, unknown>).rollbackPlan as string) ?? "",
        status: mapEvolutionStatus((p as Record<string, unknown>).status as string),
        reviewedBy: null,
        reviewedAt: null,
        implementedAt: ((p as Record<string, unknown>).activatedAt as Date | null)?.toISOString() ?? null,
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
        updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt),
        version: "1.0.0",
      }
    })

    return ApiResponse.ok({ items, total: totalFromSources, limit })
  } catch (error) {
    logger.error("GET /api/v1/harness/evolution-proposals 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return ApiResponse.error("获取进化提案失败", 500)
  }
}

function mapEvolutionStatus(dbStatus: string): string {
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

/**
 * GET /api/agents/[id]/governance — Agent 治理状态聚合
 *
 * 三域归属：Hermes 控制核 — AgentPolicy + HarnessBundle 治理快照
 *
 * 返回单个 Agent 的完整治理视图：
 *   - agent 基础信息
 *   - harnessStatus / riskLevel（从最新 HarnessProposal 派生）
 *   - latestSnapshot（复用 getLatestSnapshot）
 *   - activeCanary（灰度进行中时返回进度）
 *   - recentProposals[0..3]
 *   - recentAuditLogs[0..3]
 *   - bindings 摘要
 */
import { prisma } from "@/lib/prisma"
import { ApiResponse } from "@/lib/server/api-response"
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { getLatestSnapshot } from "@/lib/server/harness-snapshot"
import { mapAutomationToAuditRisk } from "@/types"
import { logger } from "@/lib/logger"

// ==============================
// 类型定义
// ==============================

interface GovernanceBundle {
  agent: {
    id: string
    name: string
    role: string
    status: string
    automationLevel: string
    harnessVersion: string
  }
  harnessStatus: string
  riskLevel: string
  latestSnapshot: {
    snapshotId: string
    snapshotType: string
    status: string
    policySnapshotVersion: string
    createdAt: string
    summary: {
      skillCount: number
      connectorCount: number
      automationLevel: string
    }
  } | null
  activeCanary: {
    canaryId: string
    proposalId: string
    status: string
    trafficPercent: number
    errorRate?: number
    successRate?: number
    startedAt: string
    endsAt: string
  } | null
  recentProposals: Array<{
    proposalId: string
    title: string
    status: string
    severity: string
    proposalType: string
    createdAt: string
  }>
  recentAuditLogs: Array<{
    id: string
    action: string
    detail: string | null
    riskLevel: string | null
    status: string
    createdAt: string
  }>
  /** 最近 5 条 WorkflowRun（Agent 执行证据） */
  recentWorkflowRuns: Array<{
    runId: string
    workflowId: string
    status: string
    triggerType: string
    errorMessage: string | null
    startedAt: string | null
    completedAt: string | null
    durationMs: number | null
  }>
  bindings: {
    skillCount: number
    connectorCount: number
    skillNames: string[]
    connectorNames: string[]
  }
}

// ==============================
// 辅助函数
// ==============================

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 从 HarnessCanary.observationMetrics JSON 中提取 errorRate / successRate */
function extractCanaryMetrics(metrics: unknown): { errorRate?: number; successRate?: number } {
  if (!metrics || typeof metrics !== "object") return {}
  const m = metrics as Record<string, unknown>
  const result: { errorRate?: number; successRate?: number } = {}
  if (typeof m.errorRate === "number") result.errorRate = m.errorRate
  if (typeof m.successRate === "number") result.successRate = m.successRate
  return result
}

// ==============================
// Route Handler
// ==============================

export const GET = withRBAC(
  async (
    _req: Request,
    ctx: WorkspaceContext,
    routeCtx: RouteContext<{ id: string }>,
  ) => {
    try {
      const { id: agentId } = await routeCtx.params

      // 1. 验证 Agent 存在
      const agent = await prisma.agent.findUnique({
        where: { id: agentId, workspaceId: ctx.workspaceId },
      })
      if (!agent) {
        return ApiResponse.error("智能体不存在", 404)
      }

      // 2. 并行查询治理数据
      const [
        allProposalsRaw,
        latestSnapshot,
        activeCanary,
        recentProposals,
        recentAuditLogs,
        recentWorkflowRuns,
      ] = await Promise.all([
        // 最新一条 HarnessProposal（派生 harnessStatus + riskLevel）
        // 注：affectedAgents 在 Prisma 中可能是 Json 类型，不能用 contains；
        // 改为拉取全部后 JS 端过滤（数据量小，安全可行）
        prisma.harnessProposal.findMany({
          where: { workspaceId: ctx.workspaceId },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        // 最新活跃快照
        getLatestSnapshot(ctx.workspaceId, agentId),
        // 活跃 Canary
        prisma.harnessCanary.findFirst({
          where: {
            agentId,
            workspaceId: ctx.workspaceId,
            status: { in: ["running", "promoting", "rolling-back"] },
          },
          orderBy: { startedAt: "desc" },
        }),
        // 最近 3 条 Proposal（同上：JS 端过滤）
        (async () => {
          const all = await prisma.harnessProposal.findMany({
            where: { workspaceId: ctx.workspaceId },
            orderBy: { createdAt: "desc" },
            take: 10,
          });
          return all.filter((p) => {
            try {
              const ids: unknown = JSON.parse((p.affectedAgents as string) ?? "[]");
              return Array.isArray(ids) && ids.includes(agentId);
            } catch {
              return false;
            }
          }).slice(0, 3);
        })(),
        // 最近 3 条 AuditLog
        prisma.auditLog.findMany({
          where: {
            targetId: agentId,
            targetType: "agent",
            workspaceId: ctx.workspaceId,
          },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: {
            id: true,
            action: true,
            detail: true,
            riskLevel: true,
            status: true,
            createdAt: true,
          },
        }),
        // 最近 5 条 WorkflowRun（Agent 执行证据）
        prisma.workflowRun.findMany({
          where: {
            agentId,
            workspaceId: ctx.workspaceId,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            runId: true,
            workflowId: true,
            status: true,
            triggerType: true,
            errorMessage: true,
            startedAt: true,
            completedAt: true,
            durationMs: true,
          },
        }),
      ])

      // 3. 从 allProposalsRaw 中找出匹配该 agent 的最新提案
      const latestProposal = allProposalsRaw.find((p) => {
        try {
          const ids: unknown = JSON.parse((p.affectedAgents as string) ?? "[]");
          return Array.isArray(ids) && ids.includes(agentId);
        } catch {
          return false;
        }
      })

      // 4. 派生 harnessStatus
      const harnessStatus = (latestProposal?.status as string) ?? "none"

      // 5. 派生 riskLevel: proposal.severity > mapAutomationToAuditRisk
      const riskLevel =
        (latestProposal?.severity as string) ??
        mapAutomationToAuditRisk((agent.automationLevel as Parameters<typeof mapAutomationToAuditRisk>[0]) ?? "L2")

      // 5. 构建 bindings 摘要
      const bindSkillIds = parseJsonArray(agent.bindSkills)
      const bindConnectorIds = parseJsonArray(agent.bindConnectors)

      let skillNames: string[] = []
      let connectorNames: string[] = []

      if (bindSkillIds.length > 0) {
        const skills = await prisma.skill.findMany({
          where: { id: { in: bindSkillIds }, workspaceId: ctx.workspaceId },
          select: { name: true },
        })
        skillNames = skills.map((s) => s.name)
      }
      if (bindConnectorIds.length > 0) {
        const connectors = await prisma.connector.findMany({
          where: { id: { in: bindConnectorIds }, workspaceId: ctx.workspaceId },
          select: { name: true },
        })
        connectorNames = connectors.map((c) => c.name)
      }

      // 6. 组装响应
      const canaryMetrics = activeCanary?.observationMetrics
        ? extractCanaryMetrics(activeCanary.observationMetrics)
        : {}

      const governance: GovernanceBundle = {
        agent: {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          status: agent.status,
          automationLevel: agent.automationLevel,
          harnessVersion: agent.harnessVersion,
        },
        harnessStatus,
        riskLevel,
        latestSnapshot: latestSnapshot
          ? {
              snapshotId: latestSnapshot.snapshotId,
              snapshotType: latestSnapshot.snapshotType,
              status: latestSnapshot.status,
              policySnapshotVersion: latestSnapshot.policySnapshotVersion,
              createdAt: latestSnapshot.createdAt.toISOString(),
              summary: {
                skillCount: Array.isArray(latestSnapshot.skillBindings)
                  ? latestSnapshot.skillBindings.length
                  : 0,
                connectorCount: Array.isArray(latestSnapshot.connectorBindings)
                  ? latestSnapshot.connectorBindings.length
                  : 0,
                automationLevel:
                  (latestSnapshot.agentConfig as Record<string, unknown>)
                    ?.automationLevel as string ?? "L2",
              },
            }
          : null,
        activeCanary: activeCanary
          ? {
              canaryId: activeCanary.canaryId,
              proposalId: activeCanary.proposalId,
              status: activeCanary.status,
              trafficPercent: activeCanary.trafficPercent,
              ...canaryMetrics,
              startedAt: activeCanary.startedAt.toISOString(),
              endsAt: activeCanary.endsAt.toISOString(),
            }
          : null,
        recentProposals: recentProposals.map((p) => ({
          proposalId: p.proposalId,
          title: p.title,
          status: p.status,
          severity: p.severity,
          proposalType: p.proposalType,
          createdAt: p.createdAt.toISOString(),
        })),
        recentAuditLogs: recentAuditLogs.map((l) => ({
          id: l.id,
          action: l.action,
          detail: l.detail,
          riskLevel: l.riskLevel,
          status: l.status,
          createdAt: l.createdAt.toISOString(),
        })),
        recentWorkflowRuns: recentWorkflowRuns.map((r) => ({
          runId: r.runId,
          workflowId: r.workflowId,
          status: r.status,
          triggerType: r.triggerType,
          errorMessage: r.errorMessage,
          startedAt: r.startedAt?.toISOString() ?? null,
          completedAt: r.completedAt?.toISOString() ?? null,
          durationMs: r.durationMs,
        })),
        bindings: {
          skillCount: bindSkillIds.length,
          connectorCount: bindConnectorIds.length,
          skillNames,
          connectorNames,
        },
      }

      return ApiResponse.ok({ governance })
    } catch (error) {
      logger.error("GET /api/agents/[id]/governance: 失败", {
        error: error instanceof Error ? error.message : "未知错误",
      })
      return ApiResponse.error("加载治理状态失败", 500)
    }
  },
  "VIEWER",
)

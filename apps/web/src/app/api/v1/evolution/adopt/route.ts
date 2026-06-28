/**
 * POST /api/v1/evolution/adopt — 采纳进化提案
 *
 * 触发 approval flow：创建 ApprovalCheckpoint，更新提案状态为 pending，
 * 写入 AuditLog（evolution.proposal.adopted），发射 ExecutionEvent。
 *
 * 三域调用点：[控制域] — Hermes 提案决策层
 *
 * 审批门禁：L3 gate — 前端二次确认 + 后端 createApprovalCheckpoint
 *
 * v3.43 修复：
 * - #1 AuditLog 绑定 taskId / workflowRunId（从关联 WorkflowRun 反查）
 * - #3 采纳操作发射 ExecutionEvent（proposal.adopted → run.completed pattern）
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { ApiResponse } from "@/lib/server/api-response"
import { buildWorkspaceContext } from "@/lib/workspace"
import { writeAuditLog, actorFromSession, createAuditEntry, updateAuditEntry } from "@/lib/server/audit"
import { createApprovalCheckpoint, PROPOSAL_APPROVAL_EXPIRY_MS } from "@/lib/server/approval"
import {
  createExecutionEvent,
  emitBusEvent,
} from "@hermesclaw/openclaw-adapter"
import { z } from "zod"

export const runtime = "nodejs"

const AdoptProposalSchema = z.object({
  proposalId: z.string().min(1),
  /** 可选：采纳理由 */
  reason: z.string().optional(),
})

export async function POST(request: Request) {
  let auditEntry = { auditId: "", ok: false }
  try {
    const ctx = await buildWorkspaceContext(request)
    const actor = await actorFromSession()

    const body = await request.json().catch(() => ({}))
    const parsed = AdoptProposalSchema.safeParse(body)
    if (!parsed.success) {
      return ApiResponse.error("无效的请求体: proposalId 必须提供", 400)
    }

    const { proposalId, reason } = parsed.data

    // 查找提案
    const proposal = await prisma.harnessProposal.findFirst({
      where: { proposalId, workspaceId: ctx.workspaceId },
    })

    if (!proposal) {
      return ApiResponse.error("提案不存在", 404)
    }

    // 状态机门禁：只有 draft / pending 状态的提案可以采纳
    if (!["draft", "pending"].includes(proposal.status)) {
      return ApiResponse.error(
        `提案状态为 ${proposal.status}，仅 draft/pending 状态可采纳`,
        409,
      )
    }

    const severityStr = (proposal.severity as string) ?? "medium"
    // AuditRiskLevel 不含 "critical"，安全映射
    const auditRiskLevel: "low" | "medium" | "high" =
      severityStr === "critical" ? "high" : (severityStr as "low" | "medium" | "high")

    // ─── 反查追踪链：从 HarnessProposal → EvolutionLog → WorkflowRun ─────
    // EvolutionLog.proposalId 关联触发该提案的评估日志
    // WorkflowRun 的 agentId="A5" 产出评估报告时写入
    let taskId: string | undefined
    let workflowRunId: string | undefined
    try {
      const evolutionLog = await prisma.evolutionLog.findFirst({
        where: { proposalId, workspaceId: ctx.workspaceId },
        orderBy: { evaluatedAt: "desc" },
        select: { id: true },
      })
      if (evolutionLog) {
        // A5 Agent 产出评估报告时写入的 WorkflowRun
        const a5Run = await prisma.workflowRun.findFirst({
          where: {
            workspaceId: ctx.workspaceId,
            agentId: "A5",
            status: "completed",
          },
          orderBy: { completedAt: "desc" },
          select: { runId: true },
        })
        if (a5Run) {
          workflowRunId = a5Run.runId
          taskId = `task-${proposalId}` // 派生 taskId（提案为决策产物）
        }
      }
    } catch {
      // 反查失败不阻塞主流程
    }

    // ─── 发射 ExecutionEvent：proposal.adopted（运行中） ──────────────────
    const runtimeId = "hermes-proposal-engine"
    const derivedTaskId = taskId ?? `task-${proposalId}`
    const derivedRunId = workflowRunId ?? `run-proposal-${Date.now()}`

    emitBusEvent(
      createExecutionEvent({
        taskId: derivedTaskId,
        workflowRunId: derivedRunId,
        runtimeId,
        eventType: "run.started",
        status: "started",
        payload: {
          action: "evolution.proposal.adopted",
          proposalId,
          triggerReason: proposal.triggerReason,
          riskLevel: auditRiskLevel,
        },
      }),
    )

    // 审计预记录：evolution.proposal.adopted
    auditEntry = await createAuditEntry({
      actor,
      action: "evolution.proposal.adopted",
      targetType: "proposal",
      targetId: proposalId,
      detail: reason ?? `采纳进化提案 ${proposalId}`,
      riskLevel: auditRiskLevel,
      workspaceId: ctx.workspaceId,
      automationLevel: "L3",
      triggeredBy: "user",
      workflowRunId: derivedRunId,
      contextSnapshot: {
        proposalId,
        previousStatus: proposal.status,
        targetComponent: (proposal.proposedChange as Record<string, unknown>)?.targetComponent,
        taskId: derivedTaskId,
        workflowRunId: derivedRunId,
      },
    })

    if (!auditEntry.ok) {
      logger.error("[evolution.adopt] 审计预记录失败，拒绝执行")
      return ApiResponse.error("治理留痕失败，操作被拒绝", 500)
    }

    // 创建审批检查点（L3 gate：前端二次确认 + 后端 createApprovalCheckpoint）
    await createApprovalCheckpoint({
      proposalId: proposal.id,
      workspaceId: ctx.workspaceId,
      triggerReason: severityStr === "high" || severityStr === "critical"
        ? "risk.level.high"
        : "manual.escalation",
      riskLevel: auditRiskLevel,
      automationLevel: "L3",
      actionSummary: `采纳进化提案: ${proposal.problemStatement}`,
      inputSnapshot: {
        proposalId,
        proposedChange: proposal.proposedChange,
        estimatedImpact: proposal.estimatedImpact,
        rollbackPlan: proposal.rollbackPlan,
        taskId: derivedTaskId,
        workflowRunId: derivedRunId,
      },
      policySnapshotVersion: "1.0.0",
      expiresAt: new Date(Date.now() + PROPOSAL_APPROVAL_EXPIRY_MS),
    })

    // 更新提案状态为 pending（等待审批）
    await prisma.harnessProposal.update({
      where: { id: proposal.id },
      data: {
        status: "pending",
        updatedAt: new Date(),
      },
    })

    // ─── 发射 ExecutionEvent：proposal.adopted（已完成） ──────────────────
    emitBusEvent(
      createExecutionEvent({
        taskId: derivedTaskId,
        workflowRunId: derivedRunId,
        runtimeId,
        eventType: "run.completed",
        status: "completed",
        payload: {
          action: "evolution.proposal.adopted",
          proposalId,
          proposalStatus: "pending",
          approvalCheckpointCreated: true,
          summary: `进化提案 ${proposalId} 已采纳，等待人工审批`,
        },
      }),
    )

    // 更新审计记录为成功
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "success",
      detail: `已采纳进化提案 ${proposalId}，状态: draft → pending，等待审批`,
    })

    // 同时写入一条 approval.requested 审计记录
    await writeAuditLog({
      actor,
      action: "approval.requested",
      targetType: "proposal",
      targetId: proposalId,
      detail: `采纳后发起审批: ${proposal.problemStatement}`,
      riskLevel: auditRiskLevel,
      workspaceId: ctx.workspaceId,
      workflowRunId: derivedRunId,
      contextSnapshot: {
        proposalId,
        proposedChange: proposal.proposedChange,
        estimatedImpact: proposal.estimatedImpact,
        taskId: derivedTaskId,
        workflowRunId: derivedRunId,
      },
    })

    logger.info("[evolution.adopt] 提案已采纳并等待审批", {
      proposalId,
      actor,
      taskId: derivedTaskId,
      workflowRunId: derivedRunId,
    })

    return ApiResponse.ok({
      proposalId,
      status: "pending",
      taskId: derivedTaskId,
      workflowRunId: derivedRunId,
      message: "提案已提交审批，请前往审批中心完成最终决策",
    })
  } catch (error) {
    // 预记录存在时标记失败
    if (auditEntry.auditId) {
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "failed",
        detail: `执行异常: ${error instanceof Error ? error.message : "未知错误"}`,
      }).catch(() => {})
    }

    logger.error("POST /api/v1/evolution/adopt 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return ApiResponse.error("采纳进化提案失败", 500)
  }
}

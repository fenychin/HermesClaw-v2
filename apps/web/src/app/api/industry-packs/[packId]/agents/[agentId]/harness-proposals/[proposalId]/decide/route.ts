import { withRBAC } from "@/lib/server/api-handler"
import { prisma } from "@/lib/prisma"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { z } from "zod"

const DecideSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
})

export const POST = withRBAC(async (req, ctx, routeContext) => {
  const { proposalId } = await (routeContext as any).params
  const body = DecideSchema.parse(await req.json())

  const proposal = await prisma.harnessProposal.findUnique({
    where: { proposalId }
  })

  if (!proposal) {
    return Response.json({ error: "Proposal not found" }, { status: 404 })
  }

  if (proposal.approvalStatus !== "pending") {
    return Response.json(
      { error: `Proposal already ${proposal.approvalStatus}` },
      { status: 409 }
    )
  }

  const agentId = proposal.agentId
  if (!agentId) {
    return Response.json({ error: "Agent ID not specified in proposal" }, { status: 400 })
  }

  const actor = await actorFromSession()
  const currentVersion = proposal.currentHarnessVersion ?? "2.2.0"

  if (body.action === "approve") {
    // 计算新版本号（patch 版本 +1）
    const parts = currentVersion.split(".").map(Number)
    parts[2] = (parts[2] ?? 0) + 1
    const newVersion = parts.join(".")

    await prisma.harnessProposal.update({
      where: { proposalId },
      data: {
        approvalStatus: "approved",
        approvedBy: ctx.userId,
        approvedAt: new Date(),
        newHarnessVersion: newVersion,
      }
    })

    // 写入版本历史（追加，不覆盖）
    await prisma.agentMemoryEntry.create({
      data: {
        patchId: `harness-upgrade-${proposalId}`,
        agentId,
        sourceTaskId: proposalId,
        patchLayer: "longTerm",
        operation: "append",
        content: {
          type: "harness_version_history",
          version: newVersion,
          changes: proposal.proposedChanges,
          approvedBy: ctx.userId,
        },
        confidence: 1.0,
        ttl: -1, // 永久保留
        writtenAt: new Date(),
        auditTraceId: proposalId,
      }
    })

    await writeAuditLog({
      actor,
      action: "HARNESS_PROPOSAL_APPROVED",
      targetType: "agent",
      targetId: agentId,
      detail: `Harness 进化提案 ${proposalId} 已批准，版本 ${currentVersion} → ${newVersion}`,
      riskLevel: "medium",
      workspaceId: ctx.workspaceId,
      workflowRunId: proposal.workflowRunId ?? undefined, // 遵循 AGENTS.md 顶层字段要求
      contextSnapshot: { proposalId, proposalType: proposal.proposalType, newVersion }
    })

    return Response.json({
      success: true,
      agentId,
      newHarnessVersion: newVersion,
      message: `Agent ${agentId} harness 已升级至 ${newVersion}`
    })

  } else {
    await prisma.harnessProposal.update({
      where: { proposalId },
      data: {
        approvalStatus: "rejected",
        approvedBy: ctx.userId,
        approvedAt: new Date(),
        rejectionReason: body.reason ?? "未提供原因",
      }
    })

    await writeAuditLog({
      actor,
      action: "HARNESS_PROPOSAL_REJECTED",
      targetType: "agent",
      targetId: agentId,
      detail: `Harness 进化提案 ${proposalId} 已拒绝：${body.reason ?? "未说明原因"}`,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
      workflowRunId: proposal.workflowRunId ?? undefined, // 遵循 AGENTS.md 顶层字段要求
    })

    return Response.json({
      success: true,
      agentId,
      message: "提案已拒绝，agent 保持当前 harness 版本"
    })
  }

}, "ADMIN")

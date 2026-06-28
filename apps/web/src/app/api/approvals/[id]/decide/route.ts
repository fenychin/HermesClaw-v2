import { withRBAC } from "@/lib/server/api-handler";
import { decideApprovalCheckpoint } from "@/lib/server/approval";
import type { RouteContext } from "@/lib/server/api-handler";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@hermesclaw/event-contracts";

export const POST = withRBAC(async (request: any, ctx: any, routeContext: RouteContext<{ id: string }>) => {
  const { id } = await routeContext.params;
  const body = await request.json();
  const decision = body.decision || "approved";
  const decidedBy = body.decidedBy || ctx.userId || "system";
  const comment = body.comment || "";

  if (decision !== "approved" && decision !== "rejected") {
    return Response.json({ success: false, error: "Invalid decision" }, { status: 400 });
  }

  // 两阶段审批安全校验：如果是智能体演化方案（Harness Proposal），强制校验 ADMIN 权限；如果是普通工作流，允许 MEMBER 决策。
  const record = await prisma.approvalCheckpoint.findUnique({
    where: { checkpointId: id }
  });
  if (!record) {
    return Response.json({ success: false, error: "Checkpoint not found" }, { status: 404 });
  }
  if (record.proposalId && ctx.role !== "ADMIN") {
    return Response.json({ success: false, error: "Forbidden: Only ADMIN can approve Harness proposals" }, { status: 403 });
  }

  // 跨人审批安全校验：如果不是 ADMIN/OWNER (即角色为 MEMBER)，只允许确认/审批自己提交的任务工单，防止普通成员越权确认他人高危动作。
  if (ctx.role !== "ADMIN" && ctx.role !== "OWNER") {
    const requestLog = await prisma.auditLog.findFirst({
      where: {
        action: AuditAction.APPROVAL_REQUESTED,
        targetId: id,
        workspaceId: ctx.workspaceId
      },
      select: { actor: true }
    });
    const requestedBy = requestLog?.actor || "system";
    if (requestedBy !== ctx.userId) {
      return Response.json({ success: false, error: "Forbidden: MEMBER cannot approve tasks requested by other users" }, { status: 403 });
    }
  }

  const checkpoint = await decideApprovalCheckpoint(id, decision, decidedBy, comment, {
    writeAuditLog: async (input: any) => {
      const { writeAuditLog } = await import("@/lib/server/audit");
      await writeAuditLog(input);
    },
    recordProposalSnapshot: async (proposalId: string) => {
      const { prisma } = await import("@/lib/prisma");
      const proposal = await prisma.harnessProposal.findUnique({
        where: { id: proposalId },
        select: { workspaceId: true, affectedAgents: true }
      });
      if (!proposal) return;
      const { captureSnapshot } = await import("@/lib/server/harness-snapshot");
      let agentIds: string[] = [];
      try {
        agentIds = typeof proposal.affectedAgents === "string"
          ? JSON.parse(proposal.affectedAgents) || []
          : Array.isArray(proposal.affectedAgents) ? proposal.affectedAgents : [];
      } catch {};
      for (const agentId of agentIds.length > 0 ? agentIds : ["default"]) {
        await captureSnapshot({ workspaceId: proposal.workspaceId, agentId, proposalId, snapshotType: "pre-canary", createdBy: "system" });
      }
    },
    triggerCanary: async (proposalId: string) => {
      const { prisma } = await import("@/lib/prisma");
      const proposal = await prisma.harnessProposal.findUnique({
        where: { id: proposalId },
        select: { workspaceId: true, affectedAgents: true }
      });
      if (!proposal) return;
      const { startCanary } = await import("@/lib/server/canary");
      const { getLatestSnapshot } = await import("@/lib/server/harness-snapshot");
      let agentIds: string[] = [];
      try {
        agentIds = typeof proposal.affectedAgents === "string"
          ? JSON.parse(proposal.affectedAgents) || []
          : Array.isArray(proposal.affectedAgents) ? proposal.affectedAgents : [];
      } catch {};
      const targetAgentId = agentIds.length > 0 ? agentIds[0] : "default";
      const snapshot = await getLatestSnapshot(proposal.workspaceId, targetAgentId);
      if (!snapshot) return;
      await startCanary({ proposalId, workspaceId: proposal.workspaceId, agentId: targetAgentId, snapshotId: snapshot.snapshotId, startedBy: "system" });
    },
  });

  return Response.json({ success: true, data: checkpoint });
}, "MEMBER");

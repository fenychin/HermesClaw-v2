import { withRBAC } from "@/lib/server/api-handler";
import { decideApprovalCheckpoint } from "@/lib/server/approval";
import type { RouteContext } from "@/lib/server/api-handler";

/**
 * POST /api/approvals/[id]/decide
 * 对审批检查点做出决策（approved / rejected）
 */
export const POST = withRBAC(async (request, ctx, routeContext: RouteContext<{ id: string }>) => {
  const { id } = await routeContext.params;
  const body = await request.json();

  const decision = body.decision;
  const decidedBy = body.decidedBy || ctx.userId || "system";
  const comment = body.comment || "";

  if (decision !== "approved" && decision !== "rejected") {
    return Response.json(
      { success: false, error: "Invalid decision. Must be 'approved' or 'rejected'." },
      { status: 400 }
    );
  }

  const checkpoint = await decideApprovalCheckpoint(id, decision, decidedBy, comment, {
    writeAuditLog: async (input) => {
      const { writeAuditLog } = await import("@/lib/server/audit");
      await writeAuditLog(input);
    },
    recordProposalSnapshot: async (proposalId) => {
      const { prisma } = await import("@/lib/prisma");
      const proposal = await prisma.harnessProposal.findUnique({
        where: { id: proposalId },
        select: { workspaceId: true, affectedAgents: true }
      });
      if (!proposal) return;

      const { captureSnapshot } = await import("@/lib/server/harness-snapshot");
      
      let agentIds: string[] = [];
      try {
        if (typeof proposal.affectedAgents === "string") {
          agentIds = JSON.parse(proposal.affectedAgents) || [];
        } else if (Array.isArray(proposal.affectedAgents)) {
          agentIds = proposal.affectedAgents as string[];
        }
      } catch {
        agentIds = [];
      }

      const targetAgentIds = agentIds.length > 0 ? agentIds : ["default"];

      for (const agentId of targetAgentIds) {
        await captureSnapshot({
          workspaceId: proposal.workspaceId,
          agentId,
          proposalId,
          snapshotType: "pre-canary",
          createdBy: "system",
        });
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
        if (typeof proposal.affectedAgents === "string") {
          agentIds = JSON.parse(proposal.affectedAgents) || [];
        } else if (Array.isArray(proposal.affectedAgents)) {
          agentIds = proposal.affectedAgents as string[];
        }
      } catch {
        agentIds = [];
      }
      const targetAgentId = agentIds.length > 0 ? agentIds[0] : "default";

      const snapshot = await getLatestSnapshot(proposal.workspaceId, targetAgentId);
      if (!snapshot) {
        console.error("[triggerCanary] No snapshot found, cannot start canary for proposal:", proposalId);
        return;
      }

      await startCanary({
        proposalId,
        workspaceId: proposal.workspaceId,
        agentId: targetAgentId,
        snapshotId: snapshot.snapshotId,
        startedBy: "system",
      });
    },
  });

  return Response.json({
    success: true,
    data: checkpoint,
  });
}, "ADMIN");

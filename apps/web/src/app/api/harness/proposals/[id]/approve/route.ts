/**
 * POST /api/harness/proposals/[id]/approve — 提案审批
 *
 * Sprint 3 MVP：调用 hermes-kernel approveHarnessProposal()
 * — riskLevel ≥ high → status='canary' + canaryStartedAt
 * — riskLevel < high → status='active'
 * 所有决策自动写入 AuditLog。
 */
import { prisma } from "@/lib/prisma";
import { withRBAC, type RouteContext } from "@/lib/server/api-handler";
import { actorFromSession } from "@/lib/server/audit";
import type { WorkspaceContext } from "@/lib/workspace";
import { ApiResponse } from "@/lib/server/api-response";
import { approveHarnessProposal } from "@hermesclaw/hermes-kernel";
import { z } from "zod";

const ApproveProposalSchema = z.object({
  confirmText: z.string().optional(),
});

export const POST = withRBAC(
  async (
    req: Request,
    ctx: WorkspaceContext,
    routeCtx: RouteContext<{ id: string }>,
  ) => {
    const { id } = await routeCtx.params;
    const actor = await actorFromSession();

    let body: any = {};
    try {
      const raw = await req.json();
      const parsed = ApproveProposalSchema.safeParse(raw);
      if (parsed.success) body = parsed.data;
    } catch {
      /* no body */
    }

    // 查找提案 ID（支持 HEP-xxx 格式或内部 cuid）
    const queryWhere = id.startsWith("HEP-")
      ? { proposalId: id, workspaceId: ctx.workspaceId }
      : { id, workspaceId: ctx.workspaceId };

    const proposal = await prisma.harnessProposal.findFirst({
      where: queryWhere,
    });
    if (!proposal) return ApiResponse.error("提案不存在", 404);

    // 调用 kernel 审批逻辑（含 canary 判定 + AuditLog 写入）
    const result = await approveHarnessProposal(
      {
        proposalId: proposal.id,
        workspaceId: ctx.workspaceId,
        actor,
        reason: body.confirmText,
      },
      { prisma },
    );

    if (!result.ok) {
      return ApiResponse.error(result.message, 400);
    }

    // 🔗 贯通自演化升级审批数据链：若提案状态变更为 canary，强制进行系统快照并物理启动 Canary 进程
    if (result.newStatus === "canary") {
      try {
        const { captureSnapshot } = await import("@/lib/server/harness-snapshot");
        const { startCanary } = await import("@/lib/server/canary");
        const { getLatestSnapshot } = await import("@/lib/server/harness-snapshot");

        let agentIds: string[] = [];
        try {
          agentIds = typeof proposal.affectedAgents === "string"
            ? JSON.parse(proposal.affectedAgents) || []
            : Array.isArray(proposal.affectedAgents) ? proposal.affectedAgents : [];
        } catch {}

        // 1. 捕获升级前安全备份快照
        for (const agentId of agentIds.length > 0 ? agentIds : ["default"]) {
          await captureSnapshot({
            workspaceId: proposal.workspaceId,
            agentId,
            proposalId: proposal.id,
            snapshotType: "pre-canary",
            createdBy: "system",
          });
        }

        // 2. 物理唤醒并运行 Canary 灰度监测
        const targetAgentId = agentIds.length > 0 ? agentIds[0] : "default";
        const snapshot = await getLatestSnapshot(proposal.workspaceId, targetAgentId);
        if (snapshot) {
          await startCanary({
            proposalId: proposal.id,
            workspaceId: proposal.workspaceId,
            agentId: targetAgentId,
            snapshotId: snapshot.snapshotId,
            startedBy: "system",
          });
        }
      } catch (err) {
        console.error("[harness-approve-api] 触发快照或启动 Canary 失败:", err);
      }
    }

    return ApiResponse.ok({
      proposalId: proposal.proposalId,
      status: result.newStatus,
      approvedAt: new Date().toISOString(),
      message: result.message,
    });
  },
  "ADMIN",
);

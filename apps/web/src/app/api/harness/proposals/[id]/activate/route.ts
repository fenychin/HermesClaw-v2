/**
 * POST /api/harness/proposals/[id]/activate — 激活提案（canary → active）
 *
 * 验证 status 为 'canary'，检查 canaryMetrics 中 workflowFailureRate ≤ 0.3，
 * 更新 status → 'active'，将同 workspace 其他 active 提案置为 superseded。
 */
import { prisma } from "@/lib/prisma";
import { withRBAC, type RouteContext } from "@/lib/server/api-handler";
import { actorFromSession } from "@/lib/server/audit";
import type { WorkspaceContext } from "@/lib/workspace";
import { ApiResponse } from "@/lib/server/api-response";
import { activateProposal } from "@hermesclaw/hermes-kernel";

export const POST = withRBAC(
  async (
    _req: Request,
    ctx: WorkspaceContext,
    routeCtx: RouteContext<{ id: string }>,
  ) => {
    const { id } = await routeCtx.params;
    const actor = await actorFromSession();

    const queryWhere = id.startsWith("HEP-")
      ? { proposalId: id, workspaceId: ctx.workspaceId }
      : { id, workspaceId: ctx.workspaceId };

    const proposal = await prisma.harnessProposal.findFirst({
      where: queryWhere,
    });
    if (!proposal) return ApiResponse.error("提案不存在", 404);

    const result = await activateProposal(
      { proposalId: proposal.id, workspaceId: ctx.workspaceId, actor },
      { prisma },
    );

    if (!result.ok) {
      return ApiResponse.error(result.message, 400);
    }

    // 激活时真正应用提案修改（例如智能体技能绑定）
    const { applyProposalChangesIfAny } = await import("@/lib/server/harness-proposal-service");
    await applyProposalChangesIfAny(proposal.id, prisma);

    return ApiResponse.ok({
      proposalId: proposal.proposalId,
      status: "active",
      activatedAt: new Date().toISOString(),
      message: result.message,
    });
  },
  "ADMIN",
);

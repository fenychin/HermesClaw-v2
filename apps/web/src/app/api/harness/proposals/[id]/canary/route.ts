/**
 * POST /api/harness/proposals/[id]/canary — 启动 Canary 观察期
 *
 * 验证提案 status 为 'approved'，将 workspace 当前快照写入 previousSnapshot，
 * 更新 status → 'canary'，安排 canaryWindowHours 后的自动检查。
 */
import { prisma } from "@/lib/prisma";
import { withRBAC, type RouteContext } from "@/lib/server/api-handler";
import { actorFromSession } from "@/lib/server/audit";
import type { WorkspaceContext } from "@/lib/workspace";
import { ApiResponse } from "@/lib/server/api-response";
import { startCanary } from "@hermesclaw/hermes-kernel";

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
    if (proposal.status !== "approved") {
      return ApiResponse.error(`当前提案状态为 ${proposal.status}，仅可启动已审批提案的 Canary`, 400);
    }

    const result = await startCanary(
      { proposalId: proposal.id, workspaceId: ctx.workspaceId, actor },
      { prisma },
    );

    if (!result.ok) {
      return ApiResponse.error(result.message, 400);
    }

    const canaryEndAt = new Date(
      Date.now() + (result.proposal?.canaryWindowHours ?? 24) * 3600_000,
    ).toISOString();

    return ApiResponse.ok({
      proposalId: proposal.proposalId,
      status: "canary",
      canaryStartedAt: new Date().toISOString(),
      canaryEndAt,
      message: result.message,
    });
  },
  "ADMIN",
);

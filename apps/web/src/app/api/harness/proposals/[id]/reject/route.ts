/**
 * POST /api/harness/proposals/[id]/reject — 提案驳回
 *
 * Sprint 3 MVP：调用 hermes-kernel rejectHarnessProposal()
 * AuditLog 由 kernel 内部写入。
 */
import { prisma } from "@/lib/prisma";
import { withRBAC, type RouteContext } from "@/lib/server/api-handler";
import { actorFromSession } from "@/lib/server/audit";
import type { WorkspaceContext } from "@/lib/workspace";
import { ApiResponse } from "@/lib/server/api-response";
import { rejectHarnessProposal } from "@hermesclaw/hermes-kernel";

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

    const result = await rejectHarnessProposal(
      { proposalId: proposal.id, workspaceId: ctx.workspaceId, actor },
      { prisma },
    );

    if (!result.ok) {
      return ApiResponse.error(result.message, 400);
    }

    return ApiResponse.ok({
      proposalId: proposal.proposalId,
      rejectedAt: new Date().toISOString(),
    });
  },
  "ADMIN",
);

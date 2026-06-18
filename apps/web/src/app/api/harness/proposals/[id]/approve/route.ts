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

    return ApiResponse.ok({
      proposalId: proposal.proposalId,
      status: result.newStatus,
      approvedAt: new Date().toISOString(),
      message: result.message,
    });
  },
  "ADMIN",
);

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

  if (decision !== "approved" && decision !== "rejected") {
    return Response.json(
      { success: false, error: "Invalid decision. Must be 'approved' or 'rejected'." },
      { status: 400 }
    );
  }

  const checkpoint = await decideApprovalCheckpoint(id, decision, decidedBy);

  return Response.json({
    success: true,
    data: checkpoint,
  });
}, "MEMBER");

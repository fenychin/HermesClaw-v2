import { withRBAC } from "@/lib/server/api-handler";
import { getApprovalCheckpoint } from "@/lib/server/approval";
import type { RouteContext } from "@/lib/server/api-handler";

/**
 * GET /api/approvals/[id]
 * 获取单个审批检查点的详情
 */
export const GET = withRBAC(async (request, ctx, routeContext: RouteContext<{ id: string }>) => {
  const { id } = await routeContext.params;
  const checkpoint = await getApprovalCheckpoint(id, ctx.workspaceId);

  if (!checkpoint) {
    return Response.json(
      { success: false, error: "ApprovalCheckpoint not found" },
      { status: 404 }
    );
  }

  return Response.json({
    success: true,
    data: checkpoint,
  });
}, "VIEWER");

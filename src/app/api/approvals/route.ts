import { withRBAC } from "@/lib/server/api-handler";
import { listPendingCheckpoints } from "@/lib/server/approval";
import type { RiskLevel } from "@/lib/server/contracts";
import type { ApprovalTriggerReason } from "@/lib/server/contracts/human-approval-checkpoint";

/**
 * GET /api/approvals?workspaceId=xxx
 * 获取当前工作空间下处于 pending 状态的审批检查点列表
 */
export const GET = withRBAC(async (request, ctx) => {
  const { searchParams } = new URL(request.url);
  const riskLevel = searchParams.get("riskLevel") as RiskLevel | null;
  const triggerReason = searchParams.get("triggerReason") as ApprovalTriggerReason | null;
  
  const pageStr = searchParams.get("page");
  const pageSizeStr = searchParams.get("pageSize");
  
  const page = pageStr ? parseInt(pageStr, 10) : undefined;
  const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : undefined;

  const result = await listPendingCheckpoints(ctx.workspaceId, {
    riskLevel: riskLevel || undefined,
    triggerReason: triggerReason || undefined,
    page: (page !== undefined && !isNaN(page)) ? page : undefined,
    pageSize: (pageSize !== undefined && !isNaN(pageSize)) ? pageSize : undefined,
  });

  return Response.json({
    success: true,
    data: result,
  });
}, "VIEWER");

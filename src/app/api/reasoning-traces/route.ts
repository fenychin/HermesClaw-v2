import { withRBAC } from "@/lib/server/api-handler";
import { listReasoningTraces } from "@/lib/server/reasoning-trace";

/**
 * GET /api/reasoning-traces
 * 获取推理轨迹列表（按 workflowRunId 过滤）
 */
export const GET = withRBAC(async (request, ctx) => {
  try {
    const { searchParams } = new URL(request.url);
    const workflowRunId = searchParams.get("workflowRunId");
    
    if (!workflowRunId) {
      return Response.json({ success: false, error: "workflowRunId is required" }, { status: 400 });
    }

    const pageStr = searchParams.get("page");
    const pageSizeStr = searchParams.get("pageSize");
    
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : 20;

    const validPage = (isNaN(page) || page < 1) ? 1 : page;
    const validPageSize = (isNaN(pageSize) || pageSize < 1) ? 20 : pageSize;

    const result = await listReasoningTraces(ctx.workspaceId, {
      workflowRunId,
      page: validPage,
      pageSize: validPageSize
    });

    return Response.json({
      success: true,
      data: result
    }, { status: 200 });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}, "VIEWER");

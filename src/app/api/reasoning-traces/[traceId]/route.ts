import { withRBAC } from "@/lib/server/api-handler";
import { getReasoningTrace } from "@/lib/server/reasoning-trace";

/**
 * GET /api/reasoning-traces/[traceId]
 * 获取单条推理轨迹（含所有 steps）
 */
export const GET = withRBAC(async (request, ctx, { params }) => {
  try {
    const traceId = params.traceId;
    if (!traceId) {
      return Response.json({ success: false, error: "Trace ID is required" }, { status: 400 });
    }

    const trace = await getReasoningTrace(traceId, ctx.workspaceId);
    
    if (!trace) {
      return Response.json({ success: false, error: "Trace not found" }, { status: 404 });
    }

    return Response.json({ success: true, data: trace }, { status: 200 });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}, "VIEWER");

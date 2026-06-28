/**
 * GET /api/connectors/[id]/receipts — 连接器 ActionReceipt 回执列表
 *
 * 三域归属：OpenClaw Execution Runtime（回执查询）
 *
 * 返回指定连接器最近 N 条 ActionReceipt：
 * - receiptHash（SHA-256 证据哈希）
 * - taskId / workflowRunId（可追踪到任务）
 * - outcome / failureReason / retryable（执行结果 + 失败信息）
 * - durationMs（执行耗时）
 */
import { withRBAC } from "@/lib/server/api-handler";
import { ApiResponse } from "@/lib/server/api-response";
import { getReceiptsByConnector } from "@/lib/server/receipt-store";

export const GET = withRBAC(async (req: Request, ctx: any) => {
  const workspaceId = ctx.workspaceId || "default";

  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const id = segments[segments.indexOf("connectors") + 1];
  if (!id) return ApiResponse.apiError("缺少连接器 ID", 400);

  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || "10", 10) || 10, 1),
    50,
  );

  try {
    const receipts = await getReceiptsByConnector(workspaceId, id, limit);
    return ApiResponse.ok({ receipts });
  } catch (error) {
    return ApiResponse.apiError(
      error instanceof Error ? error.message : "获取回执列表失败",
      500,
    );
  }
}, "VIEWER");

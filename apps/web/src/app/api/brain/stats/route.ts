/**
 * GET /api/brain/stats —— 获取智慧大脑（Brain）的统计指标与知识缺口
 */
import { buildWorkspaceContext } from "@/lib/workspace";
import { getBrainStats } from "@/lib/server/brain";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * 脑指标 GET 请求入口
 * @param request 请求上下文
 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request);
    const stats = await getBrainStats(ctx.workspaceId);
    return successResponse(stats);
  } catch (error) {
    logger.error("GET /api/brain/stats: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    });
    return errorResponse("获取脑指标数据失败");
  }
}

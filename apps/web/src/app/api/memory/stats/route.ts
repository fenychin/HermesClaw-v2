/**
 * GET /api/memory/stats
 * —— 返回记忆命中/未命中统计（真实数据，禁止前端计算假数字）
 * —— RBAC: VIEWER
 */
import { MemoryService } from "@/lib/server/memory-service";
import { withRBAC } from "@/lib/server/api-handler";
import { ApiResponse } from "@/lib/server/api-response";

export const GET = withRBAC(async (_req: Request, ctx: any) => {
  try {
    const workspaceId = ctx.workspaceId || "default";
    const stats = await MemoryService.getMemoryStats(workspaceId);

    // 补充各类型记忆数量
    const { prisma } = await import("@/lib/prisma");
    const [shortCount, midCount, longCount, frozenCount] = await Promise.all([
      prisma.memory.count({ where: { workspaceId, type: "short", status: { not: "deprecated" } } }),
      prisma.memory.count({ where: { workspaceId, type: "mid", status: { not: "deprecated" } } }),
      prisma.memory.count({ where: { workspaceId, type: "long", status: { not: "deprecated" } } }),
      prisma.memory.count({ where: { workspaceId, frozen: true, status: { not: "deprecated" } } }),
    ]);

    return ApiResponse.ok({
      ...stats,
      memoryCounts: { short: shortCount, mid: midCount, long: longCount },
      frozenCount,
    });
  } catch (error) {
    return ApiResponse.apiError(
      error instanceof Error ? error.message : "获取记忆统计失败",
      500
    );
  }
}, "VIEWER");

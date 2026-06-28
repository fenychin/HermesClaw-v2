/**
 * PATCH /api/memory/[id]/freeze
 * —— 冻结 / 解冻记忆（仅 ADMIN）
 * —— body: { frozen: boolean, reason?: string, workflowRunId?: string }
 */
import { MemoryService } from "@/lib/server/memory-service";
import { withRBAC } from "@/lib/server/api-handler";
import { ApiResponse } from "@/lib/server/api-response";

export const PATCH = withRBAC(async (req: Request, ctx: any, routeCtx: any) => {
  try {
    const workspaceId = ctx.workspaceId || "default";
    const { id } = routeCtx.params as { id: string };
    const body = await req.json();
    const actor = ctx.userId || "system";

    if (typeof body.frozen !== "boolean") {
      return ApiResponse.apiError("缺少 frozen 字段（boolean）", 400);
    }

    const memory = await MemoryService.freezeMemory(
      workspaceId,
      id,
      body.frozen,
      actor,
      body.reason,
      body.workflowRunId,  // 来源上下文：可从工作流内触发冻结时传入
    );

    return ApiResponse.ok({
      id: memory.id,
      frozen: memory.frozen,
      version: memory.version,
      summary: memory.summary,
    });
  } catch (error) {
    return ApiResponse.apiError(
      error instanceof Error ? error.message : "冻结/解冻操作失败",
      500
    );
  }
}, "ADMIN");

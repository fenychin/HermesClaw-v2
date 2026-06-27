/**
 * GET /api/memory/gaps — 获取知识缺口列表
 * POST /api/memory/gaps — 创建知识缺口（AI 引擎调用）
 * —— RBAC: GET=VIEWER, POST=MEMBER
 */
import { MemoryService } from "@/lib/server/memory-service";
import { withRBAC } from "@/lib/server/api-handler";
import { ApiResponse } from "@/lib/server/api-response";
import { writeAuditLog } from "@/lib/server/audit";

export const GET = withRBAC(async (req: Request, ctx: any) => {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = ctx.workspaceId || "default";
    const status = searchParams.get("status") as any;
    const type = searchParams.get("type") || undefined;

    const gaps = await MemoryService.listKnowledgeGaps(workspaceId, status, type);

    const formatted = gaps.map((g) => ({
      ...g,
      affectedWorkflows: g.affectedWorkflows
        ? (typeof g.affectedWorkflows === "string"
            ? JSON.parse(g.affectedWorkflows as string)
            : g.affectedWorkflows)
        : [],
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    }));

    return ApiResponse.ok({ gaps: formatted });
  } catch (error) {
    return ApiResponse.apiError(
      error instanceof Error ? error.message : "获取知识缺口失败",
      500
    );
  }
}, "VIEWER");

export const POST = withRBAC(async (req: Request, ctx: any) => {
  try {
    const workspaceId = ctx.workspaceId || "default";
    const body = await req.json();
    const actor = ctx.userId || "system";

    const gap = await MemoryService.createKnowledgeGap(workspaceId, {
      type: body.type || "missing_fact",
      title: body.title,
      description: body.description,
      impact: body.impact || "",
      affectedWorkflows: body.affectedWorkflows,
      suggestedSource: body.suggestedSource,
      priority: body.priority || "medium",
    });

    await writeAuditLog({
      actor,
      action: "knowledge_gap.created",
      targetType: "knowledge_gap",
      targetId: gap.id,
      detail: `[${gap.type}] ${gap.title}`,
      riskLevel: "low",
      workspaceId,
    }).catch(() => {});

    return ApiResponse.ok({ gap });
  } catch (error) {
    return ApiResponse.apiError(
      error instanceof Error ? error.message : "创建知识缺口失败",
      500
    );
  }
}, "MEMBER");

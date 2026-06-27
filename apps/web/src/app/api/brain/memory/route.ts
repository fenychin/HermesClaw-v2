import { prisma } from "@/lib/prisma";
import { MemoryService } from "@/lib/server/memory-service";
import { withRBAC } from "@/lib/server/api-handler";
import { ApiResponse } from "@/lib/server/api-response";
import { writeAuditLog } from "@/lib/server/audit";

export const GET = withRBAC(async (req: Request, ctx: any) => {
  try {
    const { searchParams } = new URL(req.url);
    const wsId = searchParams.get("workspaceId") || ctx.workspaceId || "default";
    const type = (searchParams.get("type") as "short" | "mid" | "long") || "long";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);

    const memories = await MemoryService.listMemories(wsId, type, page, pageSize);

    const formatted = memories.map((m) => {
      let tags: string[] = [];
      try {
        tags = typeof m.tags === "string" ? JSON.parse(m.tags) : (m.tags || []);
      } catch {
        tags = [];
      }
      return {
        id: m.id,
        type: m.type,
        content: m.content,
        summary: m.summary,
        source: m.source,
        relatedProject: m.relatedProject,
        relatedAgent: m.relatedAgent,
        confidence: m.confidence,
        frozen: m.frozen,
        tags,
        version: m.version,
        status: m.status,
        taskId: (m as any).taskId ?? null,
        workflowRunId: (m as any).workflowRunId ?? null,
        projectId: (m as any).projectId ?? null,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
        revisions: (m.revisions || []).map(r => ({
          id: r.id,
          version: r.version,
          content: r.content,
          summary: r.summary,
          editedBy: r.editedBy,
          reason: r.reason,
          proposalId: r.proposalId,
          createdAt: r.createdAt.toISOString()
        }))
      };
    });

    return ApiResponse.ok({ memories: formatted });
  } catch (error) {
    return ApiResponse.apiError(
      error instanceof Error ? error.message : "获取记忆失败",
      500
    );
  }
}, "VIEWER");

export const POST = withRBAC(async (req: Request, ctx: any) => {
  try {
    const workspaceId = ctx.workspaceId || "default";
    const body = await req.json();
    const actor = ctx.userId || "system";

    const memory = await MemoryService.createMemory(workspaceId, {
      type: body.type,
      content: body.content,
      summary: body.summary,
      source: body.source || "user",
      relatedProject: body.relatedProject,
      relatedAgent: body.relatedAgent,
      confidence: body.confidence,
      frozen: body.frozen,
      tags: body.tags,
      projectId: body.projectId,
      proposalId: body.proposalId
    }, actor);

    // 操作日志：记忆操作无工作流上下文，显式传 workflowRunId: null
    await writeAuditLog({
      actor,
      action: "memory.created",
      targetType: "memory",
      targetId: memory.id,
      detail: `Successfully created memory: ${memory.summary}`,
      riskLevel: "low",
      workspaceId,
      workflowRunId: undefined // 顶层传值，等同于无
    }).catch(() => {});

    return ApiResponse.ok({ memory });
  } catch (error) {
    return ApiResponse.apiError(
      error instanceof Error ? error.message : "创建记忆失败",
      500
    );
  }
}, "MEMBER");

export const PATCH = withRBAC(async (req: Request, ctx: any) => {
  try {
    const workspaceId = ctx.workspaceId || "default";
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const body = await req.json();
    const actor = ctx.userId || "system";

    if (!id) {
      return ApiResponse.apiError("Missing query param id", 400);
    }

    const memory = await MemoryService.updateMemory(workspaceId, id, {
      type: body.type,
      content: body.content,
      summary: body.summary,
      source: body.source,
      relatedProject: body.relatedProject,
      relatedAgent: body.relatedAgent,
      confidence: body.confidence,
      frozen: body.frozen,
      tags: body.tags,
      projectId: body.projectId,
      reason: body.reason,
      proposalId: body.proposalId
    }, actor);

    // 操作日志
    await writeAuditLog({
      actor,
      action: "memory.updated",
      targetType: "memory",
      targetId: memory.id,
      detail: `Successfully updated memory: ${memory.summary}`,
      riskLevel: "low",
      workspaceId,
      workflowRunId: undefined
    }).catch(() => {});

    return ApiResponse.ok({ memory });
  } catch (error) {
    return ApiResponse.apiError(
      error instanceof Error ? error.message : "更新记忆失败",
      500
    );
  }
}, "MEMBER");

export const DELETE = withRBAC(async (req: Request, ctx: any) => {
  try {
    const workspaceId = ctx.workspaceId || "default";
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const actor = ctx.userId || "system";

    if (!id) {
      return ApiResponse.apiError("Missing query param id", 400);
    }

    // 先查询获取类型
    const existing = await prisma.memory.findUnique({
      where: { id }
    });

    if (!existing) {
      return ApiResponse.apiError("Memory not found", 404);
    }

    if (existing.workspaceId !== workspaceId) {
      return ApiResponse.apiError("Forbidden", 403);
    }

    let deletedMemory;
    if (existing.type === "short") {
      // 短期记忆，物理删除
      deletedMemory = await MemoryService.hardDeleteMemory(id, workspaceId);
    } else {
      // 中长期记忆，软删除
      deletedMemory = await MemoryService.softDeleteMemory(id, workspaceId);
    }

    // 操作日志
    await writeAuditLog({
      actor,
      action: "memory.deleted",
      targetType: "memory",
      targetId: id,
      detail: `Successfully deleted memory (${existing.type}): ${existing.summary}`,
      riskLevel: "medium",
      workspaceId,
      workflowRunId: undefined
    }).catch(() => {});

    return ApiResponse.ok({ success: true });
  } catch (error) {
    return ApiResponse.apiError(
      error instanceof Error ? error.message : "删除记忆失败",
      500
    );
  }
}, "MEMBER");

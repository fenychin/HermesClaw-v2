import { prisma } from "@/lib/prisma";
import { withRBAC } from "@/lib/server/api-handler";
import { ApiResponse } from "@/lib/server/api-response";
import { createAuditEntry, updateAuditEntry } from "@/lib/server/audit";
import { NextResponse } from "next/server";

// 辅助函数，用于分组
function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
    return result;
  }, {} as Record<string, T[]>);
}

/** 安全解析 JSON 字符串字段，失败时返回默认值 */
function parseJsonField<T>(raw: unknown, fallback: T): T {
  if (Array.isArray(raw)) return raw as unknown as T;
  if (typeof raw !== "string") return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as unknown as T) : fallback;
  } catch {
    return fallback;
  }
}

export const GET = withRBAC(async (req: Request, ctx: any) => {
  try {
    const workspaceId = ctx.workspaceId || "default";

    const connectors = await prisma.connector.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        category: true,
        status: true,
        packId: true,
        description: true,
        iconEmoji: true,
        lastSync: true,
        permissions: true,
        usedByAgents: true,
        source: true,
        version: true,
        health: true,
      }
    });

    // 兼容处理：旧数据的 packId 为空时映射到 foreign-trade
    const formatted = connectors.map(c => ({
      ...c,
      packId: c.packId || (c.id === 'email' || c.id === 'crm' ? 'foreign-trade' : 'system'),
      permissions: parseJsonField<string[]>(c.permissions, []),
      usedByAgents: parseJsonField<string[]>(c.usedByAgents, []),
    }));

    const grouped = groupBy(formatted, c => c.category || 'other');

    return ApiResponse.ok({
      connectors: formatted,
      grouped,
      totalCount: formatted.length
    });
  } catch (error) {
    return ApiResponse.apiError(
      error instanceof Error ? error.message : "获取连接器失败",
      500
    );
  }
}, "VIEWER");

export const PATCH = withRBAC(async (req: Request, ctx: any) => {
  try {
    const workspaceId = ctx.workspaceId || "default";
    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return ApiResponse.apiError("Missing id or status", 400);
    }

    // 系统内置连接器保护：不允许停用
    const existing = await prisma.connector.findUnique({ where: { id, workspaceId }, select: { source: true, status: true } });
    if (!existing) {
      return ApiResponse.apiError("连接器不存在", 404);
    }
    const isDeactivating = status !== 'active' && status !== 'connected';
    if (existing.source === "builtin" && isDeactivating) {
      return ApiResponse.apiError("系统内置连接器不可停用", 403);
    }

    // 二阶段审计：操作前 pending
    const auditResult = await createAuditEntry({
      actor: ctx.userId || "system",
      action: status === 'active' || status === 'connected' ? 'connector.activate' : 'connector.deactivate',
      targetType: 'Connector',
      targetId: id,
      riskLevel: 'medium',
      workspaceId,
      workflowRunId: undefined, // 顶层字段，操作无 workflowRunId
      contextSnapshot: { previousStatus: existing.status }
    });

    try {
      await prisma.connector.update({
        where: { id, workspaceId },
        data: { status }
      });

      // 操作后 success
      await updateAuditEntry({
        auditId: auditResult.auditId,
        status: 'success',
        detail: `Successfully updated connector ${id} to ${status}`
      });

      return ApiResponse.ok({ success: true });
    } catch (e) {
      // 操作后 failed
      await updateAuditEntry({
        auditId: auditResult.auditId,
        status: 'failed',
        detail: `Failed to update connector ${id}: ${e instanceof Error ? e.message : String(e)}`
      });
      throw e;
    }
  } catch (error) {
    return ApiResponse.apiError(
      error instanceof Error ? error.message : "更新连接器失败",
      500
    );
  }
}, "ADMIN");

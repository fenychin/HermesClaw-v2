/**
 * GET /api/connectors/[id]/usage — 连接器用量快照
 *
 * 返回最近 24h 的调用统计、最近测试结果、最近错误、最近事件
 */
import { prisma } from "@/lib/prisma";
import { withRBAC } from "@/lib/server/api-handler";
import { ApiResponse } from "@/lib/server/api-response";

export const GET = withRBAC(async (req: Request, ctx: any) => {
  const workspaceId = ctx.workspaceId || "default";

  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const id = segments[segments.indexOf("connectors") + 1];
  if (!id) return ApiResponse.apiError("缺少连接器 ID", 400);

  const connector = await prisma.connector.findUnique({
    where: { id, workspaceId },
  });
  if (!connector) return ApiResponse.apiError("连接器不存在", 404);

  const now = new Date();
  const y24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const connectorActions = [
    "connector.test",
    "connector.connect",
    "connector.disconnect",
    "connector.execute",
    "connector.update",
  ];

  const [totalCalls24h, successCalls24h, recentLogs] = await Promise.all([
    prisma.auditLog.count({
      where: {
        targetId: id,
        targetType: "Connector",
        action: { in: connectorActions },
        createdAt: { gte: y24h },
        workspaceId,
      },
    }),
    prisma.auditLog.count({
      where: {
        targetId: id,
        targetType: "Connector",
        action: { in: connectorActions },
        status: "success",
        createdAt: { gte: y24h },
        workspaceId,
      },
    }),
    prisma.auditLog.findMany({
      where: {
        targetId: id,
        targetType: "Connector",
        workspaceId,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        action: true,
        status: true,
        createdAt: true,
        detail: true,
        contextSnapshot: true,
      },
    }),
  ]);

  const successRate24h =
    totalCalls24h > 0
      ? Math.round((successCalls24h / totalCalls24h) * 100)
      : 100;

  const recentEvents = recentLogs.map((l) => ({
    id: l.id,
    action: l.action as string,
    status: (
      l.status === "success" ? "success"
      : l.status === "failed" ? "failed"
      : "pending"
    ) as "success" | "failed" | "pending",
    timestamp: l.createdAt.toISOString(),
    detail: l.detail || "",
    latencyMs: (l.contextSnapshot as any)?.latencyMs ?? undefined,
  }));

  const lastTestResult = recentLogs.find((l) => l.action === "connector.test");
  const lastError = recentLogs.find((l) => l.status === "failed");
  const lastSuccess = recentLogs.find((l) => l.status === "success");

  const withLatency = recentLogs.filter(
    (l) => l.status === "success" && (l.contextSnapshot as any)?.latencyMs != null
  );
  const avgLatencyMs24h =
    withLatency.length > 0
      ? Math.round(
          withLatency.reduce((sum, l) => sum + ((l.contextSnapshot as any)?.latencyMs || 0), 0) /
            withLatency.length
        )
      : 0;

  return ApiResponse.ok({
    connectorId: id,
    totalCalls24h,
    successRate24h,
    avgLatencyMs24h,
    lastTestResult: lastTestResult
      ? {
          success: lastTestResult.status === "success",
          latencyMs: (lastTestResult.contextSnapshot as any)?.latencyMs || 0,
          timestamp: lastTestResult.createdAt.toISOString(),
          error: lastTestResult.status === "failed" ? (lastTestResult.detail || undefined) : undefined,
        }
      : undefined,
    lastError: lastError
      ? { timestamp: lastError.createdAt.toISOString(), message: lastError.detail || "未知错误" }
      : undefined,
    lastSuccessAt: lastSuccess?.createdAt.toISOString(),
    recentEvents,
  });
}, "VIEWER");
/**
 * GET /api/connectors/[id]/usage — 连接器用量快照
 *
 * 三域归属：OpenClaw Execution Runtime
 *
 * 返回最近 24h 的调用统计（来源：ActionReceipt 表 + AuditLog 补充事件）
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

  // 从 ActionReceipt 表获取真实统计数据
  const [totalCalls24h, successCalls24h, failureCalls24h, recentReceipts, recentLogs] =
    await Promise.all([
      prisma.actionReceipt.count({
        where: { connectorId: id, workspaceId, executedAt: { gte: y24h } },
      }),
      prisma.actionReceipt.count({
        where: { connectorId: id, workspaceId, outcome: "success", executedAt: { gte: y24h } },
      }),
      prisma.actionReceipt.count({
        where: { connectorId: id, workspaceId, outcome: "failure", executedAt: { gte: y24h } },
      }),
      prisma.actionReceipt.findMany({
        where: { connectorId: id, workspaceId },
        orderBy: { executedAt: "desc" },
        take: 20,
        select: {
          id: true,
          receiptId: true,
          receiptHash: true,
          outcome: true,
          executedAt: true,
          durationMs: true,
          errorCode: true,
          failureReason: true,
          taskId: true,
        },
      }),
      prisma.auditLog.findMany({
        where: {
          targetId: id,
          targetType: "Connector",
          workspaceId,
          createdAt: { gte: y24h },
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

  const failureRate24h =
    totalCalls24h > 0
      ? Math.round((failureCalls24h / totalCalls24h) * 100)
      : 0;

  // 平均延迟（从 durationMs）
  const receiptsWithDuration = recentReceipts.filter((r) => r.durationMs != null);
  const avgLatencyMs24h =
    receiptsWithDuration.length > 0
      ? Math.round(
          receiptsWithDuration.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) /
            receiptsWithDuration.length,
        )
      : 0;

  // 最近事件：合并 AuditLog 事件 + ActionReceipt 事件
  const receiptEvents = recentReceipts.slice(0, 10).map((r) => ({
    id: r.id,
    action: "connector.execute",
    status: (r.outcome === "success" ? "success" : "failed") as
      | "success"
      | "failed"
      | "pending",
    timestamp: r.executedAt.toISOString(),
    detail: r.outcome === "failure"
      ? r.failureReason || r.errorCode || "执行失败"
      : `回执 ${r.receiptHash?.slice(0, 8) || r.receiptId}`,
    latencyMs: r.durationMs ?? undefined,
    taskId: r.taskId,
  }));

  const logEvents = recentLogs.slice(0, 10).map((l) => ({
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

  // 合并去重（receipt 优先）
  const receiptIds = new Set(receiptEvents.map((e) => e.id));
  const recentEvents = [
    ...receiptEvents,
    ...logEvents.filter((e) => !receiptIds.has(e.id)),
  ].slice(0, 20);

  // 最近测试结果
  const lastTestLog = recentLogs.find((l) => l.action === "connector.test");
  const lastTestResult = lastTestLog
    ? {
        success: lastTestLog.status === "success",
        latencyMs: (lastTestLog.contextSnapshot as any)?.latencyMs || 0,
        timestamp: lastTestLog.createdAt.toISOString(),
        error:
          lastTestLog.status === "failed"
            ? lastTestLog.detail || undefined
            : undefined,
      }
    : undefined;

  // 最近错误
  const lastFailedReceipt = recentReceipts.find((r) => r.outcome === "failure");
  const lastErrorLog = recentLogs.find((l) => l.status === "failed");
  const lastError = lastFailedReceipt
    ? {
        timestamp: lastFailedReceipt.executedAt.toISOString(),
        message: lastFailedReceipt.failureReason || lastFailedReceipt.errorCode || "执行失败",
      }
    : lastErrorLog
      ? {
          timestamp: lastErrorLog.createdAt.toISOString(),
          message: lastErrorLog.detail || "未知错误",
        }
      : undefined;

  // 最近成功
  const lastSuccessReceipt = recentReceipts.find((r) => r.outcome === "success");
  const lastSuccessLog = recentLogs.find((l) => l.status === "success");
  const lastSuccessAt =
    lastSuccessReceipt?.executedAt.toISOString() ??
    lastSuccessLog?.createdAt.toISOString();

  return ApiResponse.ok({
    connectorId: id,
    totalCalls24h,
    successRate24h,
    failureRate24h,
    avgLatencyMs24h,
    lastTestResult,
    lastError,
    lastSuccessAt,
    recentEvents,
  });
}, "VIEWER");

/**
 * POST /api/connectors/[id]/test — 测试连接器连通性
 *
 * - 模拟连通性校验（延迟、凭证、回执）
 * - 高风险类型（email、write HTTP）需 body.confirm=true 或走 approval gate
 * - 写 AuditLog（action=connector.test）
 */
import { prisma } from "@/lib/prisma";
import { withRBAC } from "@/lib/server/api-handler";
import { ApiResponse } from "@/lib/server/api-response";
import { createAuditEntry, updateAuditEntry } from "@/lib/server/audit";
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace";

/** 高风险分类：需二次确认 */
const HIGH_RISK_CATEGORIES = ["email", "api"];

export const POST = withRBAC(async (req: Request, ctx: any) => {
  const workspaceId = ctx.workspaceId || "default";

  // 解析路径参数
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const id = segments[segments.indexOf("connectors") + 1];
  if (!id) return ApiResponse.apiError("缺少连接器 ID", 400);

  const body = await req.json().catch(() => ({}));
  const { confirm = false, input } = body as {
    confirm?: boolean;
    input?: Record<string, unknown>;
  };

  // 查找连接器
  const connector = await prisma.connector.findUnique({
    where: { id, workspaceId },
  });
  if (!connector) return ApiResponse.apiError("连接器不存在", 404);

  // 高风险分类二次确认
  const isHighRisk = HIGH_RISK_CATEGORIES.includes(connector.category);
  if (isHighRisk && !confirm) {
    return Response.json(
      {
        success: false,
        error: `"${connector.name}" 为高风险连接器（${connector.category}），测试可能触发真实操作。请二次确认后重试。`,
        requiresConfirmation: true,
        data: { connectorId: id, category: connector.category },
      },
      { status: 409 }
    );
  }

  // 写审计日志（pending）
  const auditEntry = await createAuditEntry({
    actor: ctx.userId || "system",
    action: "connector.test",
    targetType: "Connector",
    targetId: id,
    riskLevel: isHighRisk ? "high" : "medium",
    workspaceId,
    automationLevel: isHighRisk ? "L3" : "L2",
    triggeredBy: "user",
    contextSnapshot: { input, category: connector.category },
    detail: `测试连接器 ${connector.name}`,
  });

  // 执行模拟测试
  const start = Date.now();
  let success = false;
  let error: string | undefined;
  let details: Record<string, unknown> = {};

  try {
    // 模拟：正常可达延迟 30-150ms，error 状态直接失败
    if (connector.status === "error") {
      throw new Error("连接器处于 error 状态，底层连接不可达");
    }
    // 模拟延迟
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 80));
    success = true;
    details = {
      credentialValid: true,
      endpointReachable: true,
      templateValid: true,
      receiptValid: true,
      permissionCheck: "passed",
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    success = false;
    error = e instanceof Error ? e.message : "测试失败";
    details = {
      credentialValid: false,
      endpointReachable: false,
      templateValid: true,
      receiptValid: false,
      permissionCheck: "failed",
      latencyMs: Date.now() - start,
    };
  }

  // 更新审计日志
  await updateAuditEntry({
    auditId: auditEntry.auditId,
    status: success ? "success" : "failed",
    detail: success
      ? `测试 ${connector.name} 通过，延迟 ${Date.now() - start}ms`
      : `测试 ${connector.name} 失败: ${error}`,
    contextSnapshot: {
      success,
      latencyMs: Date.now() - start,
      error,
      ...details,
    },
  });

  return ApiResponse.ok({
    success,
    latencyMs: Date.now() - start,
    error,
    details,
    timestamp: new Date().toISOString(),
    connectorName: connector.name,
  });
  }, "ADMIN");

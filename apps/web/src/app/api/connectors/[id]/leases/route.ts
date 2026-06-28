/**
 * /api/connectors/[id]/leases — 连接器租约管理
 *
 * 三域归属：Hermes（租约授权）+ OpenClaw（租约执行）
 *
 * GET    — 获取当前活跃租约或租约历史（VIEWER）
 * POST   — 申请租约（ADMIN，需二次确认）
 * DELETE — 吊销所有活跃租约（ADMIN，需二次确认）
 */
import { withRBAC } from "@/lib/server/api-handler";
import { ApiResponse } from "@/lib/server/api-response";
import {
  getActiveLease,
  listLeases,
  acquireLease,
  revokeAllLeases,
  releaseLease,
} from "@/lib/server/connectors";
import { writeAuditLog } from "@/lib/server/audit";

/** GET — 获取租约（?history=true 获取历史列表，默认返回当前活跃租约） */
export const GET = withRBAC(async (req: Request, ctx: any) => {
  const workspaceId = ctx.workspaceId || "default";

  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const id = segments[segments.indexOf("connectors") + 1];
  if (!id) return ApiResponse.apiError("缺少连接器 ID", 400);

  const history = url.searchParams.get("history") === "true";
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || "10", 10) || 10, 1),
    50,
  );

  try {
    if (history) {
      const leases = await listLeases(workspaceId, id, limit);
      return ApiResponse.ok({ leases });
    }

    const activeLease = await getActiveLease(workspaceId, id);
    return ApiResponse.ok({ lease: activeLease });
  } catch (error) {
    return ApiResponse.apiError(
      error instanceof Error ? error.message : "获取租约失败",
      500,
    );
  }
}, "VIEWER");

/** POST — 申请租约（需 ADMIN 权限，高风险连接器需 confirm=true） */
export const POST = withRBAC(async (req: Request, ctx: any) => {
  const workspaceId = ctx.workspaceId || "default";
  const actor = ctx.actor || "system";

  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const id = segments[segments.indexOf("connectors") + 1];
  if (!id) return ApiResponse.apiError("缺少连接器 ID", 400);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return ApiResponse.apiError("请求体格式错误", 400);
  }

  const {
    taskId,
    runtimeId,
    scope = ["read"],
    maxRiskLevel = "medium",
    ttlMinutes = 60,
    confirm = false,
  } = body;

  // 高风险作用域需二次确认
  const hasWriteScope = (scope as string[]).some((s) =>
    ["write", "send", "create", "modify", "delete"].includes(s.toLowerCase()),
  );
  if (hasWriteScope && !confirm) {
    return ApiResponse.apiError(
      "申请写权限租约需要二次确认（设置 confirm: true）。租约将授予写操作权限。",
      400,
    );
  }

  try {
    const lease = await acquireLease({
      workspaceId,
      connectorId: id,
      taskId: taskId || undefined,
      runtimeId: runtimeId || undefined,
      scope: scope as string[],
      maxRiskLevel: maxRiskLevel as string,
      ttlMinutes: ttlMinutes as number,
    });

    // 审计日志
    const scopeStr = (scope as string[]).join(",");
    const ttlStr = `${ttlMinutes}min`;
    await writeAuditLog({
      action: "connector.lease.acquired",
      actor,
      targetId: id,
      targetType: "Connector",
      workspaceId,
      detail: `租约 ${lease.leaseId} 已颁发（作用域: ${scopeStr}，风险: ${maxRiskLevel}，TTL: ${ttlStr}）`,
      contextSnapshot: {
        leaseId: lease.leaseId,
        scope,
        maxRiskLevel,
        ttlMinutes,
        taskId: taskId || null,
        expiresAt: lease.expiresAt,
      },
    });

    return ApiResponse.ok({ lease });
  } catch (error) {
    // 审计日志（失败）
    await writeAuditLog({
      action: "connector.lease.acquired",
      actor,
      targetId: id,
      targetType: "Connector",
      workspaceId,
      detail: error instanceof Error ? error.message : "租约申请失败",
    });

    return ApiResponse.apiError(
      error instanceof Error ? error.message : "租约申请失败",
      500,
    );
  }
}, "ADMIN");

/** DELETE — 吊销所有活跃租约（需 ADMIN 权限 + confirm=true） */
export const DELETE = withRBAC(async (req: Request, ctx: any) => {
  const workspaceId = ctx.workspaceId || "default";
  const actor = ctx.actor || "system";

  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const id = segments[segments.indexOf("connectors") + 1];
  if (!id) return ApiResponse.apiError("缺少连接器 ID", 400);

  const confirm = url.searchParams.get("confirm") === "true";
  const leaseId = url.searchParams.get("leaseId"); // 吊销单个租约

  if (!confirm) {
    return ApiResponse.apiError(
      "吊销租约需要二次确认（?confirm=true）。此操作将立即终止连接器访问权限。",
      400,
    );
  }

  try {
    if (leaseId) {
      // 吊销单个租约
      const lease = await releaseLease(leaseId);
      if (!lease) {
        return ApiResponse.apiError("租约不存在", 404);
      }

      await writeAuditLog({
        action: "connector.lease.revoked",
        actor,
        targetId: id,
        targetType: "Connector",
        workspaceId,
        detail: `租约 ${leaseId} 已吊销`,
        contextSnapshot: { leaseId },
      });

      return ApiResponse.ok({ lease, message: "租约已吊销" });
    }

    // 吊销所有活跃租约
    const count = await revokeAllLeases(workspaceId, id);

    await writeAuditLog({
      action: "connector.lease.revoked",
      actor,
      targetId: id,
      targetType: "Connector",
      workspaceId,
      detail: `已吊销 ${count} 个活跃租约`,
    });

    return ApiResponse.ok({ revokedCount: count, message: `已吊销 ${count} 个活跃租约` });
  } catch (error) {
    await writeAuditLog({
      action: "connector.lease.revoked",
      actor,
      targetId: id,
      targetType: "Connector",
      workspaceId,
      detail: error instanceof Error ? error.message : "吊销租约失败",
    });

    return ApiResponse.apiError(
      error instanceof Error ? error.message : "吊销租约失败",
      500,
    );
  }
}, "ADMIN");

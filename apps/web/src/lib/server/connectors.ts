/**
 * 连接器（Connectors）服务端逻辑
 *
 * 三域归属：OpenClaw Execution Runtime
 *
 * 职责：
 * 1. 查询当前工作空间的连接器；
 * 2. 从 ActionReceipt 表计算真实健康指标（successRate / failureRate / lastReceiptAt）；
 * 3. 推断并富化连接器元数据（authScope、configStatus、leaseStatus、requiredAutomationLevel）；
 * 4. 剥离 API 接口层的业务计算与推演逻辑。
 */
import { prisma } from "@/lib/prisma";
import { serializeConnector } from "@/lib/api-utils";
import type { Connector, ConnectorHealth } from "@/types";
import type { ActionReceipt } from "@hermesclaw/event-contracts";

export interface ConnectorsDeps {
  prisma: typeof prisma;
}

const defaultDeps: ConnectorsDeps = {
  prisma,
};

/** 批量获取连接器的最新 ActionReceipt 统计 */
async function batchGetConnectorStats(
  workspaceId: string,
  connectorIds: string[],
  deps = defaultDeps,
) {
  if (connectorIds.length === 0) return new Map<string, ConnectorStats>();

  // 一次查询获取所有连接器的聚合统计
  const stats = await deps.prisma.actionReceipt.groupBy({
    by: ["connectorId"],
    where: {
      workspaceId,
      connectorId: { in: connectorIds },
    },
    _count: { id: true },
  });

  // 分别查成功/失败计数
  const successCounts = await deps.prisma.actionReceipt.groupBy({
    by: ["connectorId"],
    where: {
      workspaceId,
      connectorId: { in: connectorIds },
      outcome: "success",
    },
    _count: { id: true },
  });

  const failureCounts = await deps.prisma.actionReceipt.groupBy({
    by: ["connectorId"],
    where: {
      workspaceId,
      connectorId: { in: connectorIds },
      outcome: "failure",
    },
    _count: { id: true },
  });

  // 获取每个连接器最近一次 receipt
  const latestReceipts = await deps.prisma.actionReceipt.findMany({
    where: {
      workspaceId,
      connectorId: { in: connectorIds },
    },
    orderBy: { executedAt: "desc" },
    distinct: ["connectorId"],
    select: {
      connectorId: true,
      executedAt: true,
    },
  });

  const totalMap = new Map(stats.map((s) => [s.connectorId, s._count.id]));
  const successMap = new Map(successCounts.map((s) => [s.connectorId, s._count.id]));
  const failureMap = new Map(failureCounts.map((s) => [s.connectorId, s._count.id]));
  const latestMap = new Map(latestReceipts.map((r) => [r.connectorId, r.executedAt]));

  const result = new Map<string, ConnectorStats>();
  for (const cid of connectorIds) {
    const total = totalMap.get(cid) ?? 0;
    const success = successMap.get(cid) ?? 0;
    const failure = failureMap.get(cid) ?? 0;
    result.set(cid, {
      totalCalls: total,
      successRate: total > 0 ? Math.round((success / total) * 100) : undefined,
      failureRate: total > 0 ? Math.round((failure / total) * 100) : undefined,
      lastReceiptAt: latestMap.get(cid)?.toISOString(),
    });
  }
  return result;
}

interface ConnectorStats {
  totalCalls: number;
  successRate?: number;
  failureRate?: number;
  lastReceiptAt?: string;
}

/** 根据 category + source 推导所需自动化等级（仅作为 DB 无显式配置时的 fallback） */
function inferRequiredAutomationLevel(
  category: string,
  source: string,
): "L1" | "L2" | "L3" | "L4" {
  // 内置高风险连接器
  if (source === "builtin" && (category === "email" || category === "api")) {
    return "L3";
  }
  // 写操作连接器
  if (category === "email" || category === "api" || category === "erp" || category === "crm") {
    return "L2";
  }
  return "L1";
}

/**
 * 解析连接器的自动化等级：DB 显式配置优先，启发式推导作为 fallback。
 *
 * 逻辑：
 * 1. 若 DB 中 requiredAutomationLevel 为非默认值（非 L1 或非空），以 DB 为准（Hermes 真相源）
 * 2. 否则使用启发式推导（OpenClaw 运行时 fallback）
 */
function resolveAutomationLevel(
  dbValue: string | null | undefined,
  category: string,
  source: string,
): "L1" | "L2" | "L3" | "L4" {
  // DB 有显式配置（非默认 L1）→ 以 DB 为准
  if (dbValue && dbValue !== "L1") {
    // 校验合法值
    if (["L1", "L2", "L3", "L4"].includes(dbValue)) {
      return dbValue as "L1" | "L2" | "L3" | "L4";
    }
  }
  // Fallback：启发式推导
  return inferRequiredAutomationLevel(category, source);
}

/** 根据 health 字段推导线上的 lease 状态 */
function inferLeaseStatus(
  health: string | undefined | null,
  status: string,
  lastHeartbeatAt?: string | null,
): "active" | "expired" | "revoked" | "none" {
  if (status === "error") return "revoked";
  if (!lastHeartbeatAt) return "none";
  const lastHb = new Date(lastHeartbeatAt).getTime();
  const now = Date.now();
  // 30s 无心跳视为 expired
  if (now - lastHb > 30_000) return "expired";
  if (health === "healthy" || health === "active") return "active";
  return "none";
}

/**
 * 获取富化后的连接器列表
 * @param workspaceId 工作空间 ID
 * @param deps 依赖注入
 * @returns 连接器列表（含真实健康数据）
 */
export async function getEnrichedConnectors(
  workspaceId: string,
  deps = defaultDeps,
): Promise<Connector[]> {
  const connectors = await deps.prisma.connector.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  if (connectors.length === 0) return [];

  const connectorIds = connectors.map((c) => c.id);
  const statsMap = await batchGetConnectorStats(workspaceId, connectorIds, deps);

  return connectors.map((c) => {
    const serialized = serializeConnector(c as unknown as Record<string, unknown>);
    const permissions = (serialized.permissions || []) as string[];
    const stats = statsMap.get(c.id);

    // 1. 授权范围推断
    const isReadWrite = permissions.some((p) =>
      ["write", "send", "create", "modify", "delete"].includes(p.toLowerCase()),
    );
    const authScope = isReadWrite ? ("readwrite" as const) : ("readonly" as const);

    // 2. 配置状态映射
    let configStatus: "connected" | "error" | "pending_config" = "pending_config";
    if (serialized.status === "connected") {
      configStatus = "connected";
    } else if (serialized.status === "error") {
      configStatus = "error";
    } else {
      const needsConfigCategories = ["crm", "erp", "api"];
      configStatus = needsConfigCategories.includes(serialized.category)
        ? "pending_config"
        : "connected";
    }

    // 3. 真实失败次数（从 ActionReceipt 统计）
    const failureCount = stats?.failureRate != null && stats.failureRate > 0
      ? (stats.totalCalls > 0 ? Math.round((stats.failureRate / 100) * stats.totalCalls) : 0)
      : 0;

    // 4. 所需自动化等级（DB 优先，启发式 fallback）
    const requiredAutomationLevel = resolveAutomationLevel(
      c.requiredAutomationLevel,
      c.category,
      c.source,
    );

    // 5. 租用状态
    const leaseStatus = inferLeaseStatus(
      c.health,
      c.status,
      c.lastHeartbeatAt?.toISOString(),
    );

    return {
      ...serialized,
      authScope,
      configStatus,
      failureCount,
      successRate: stats?.successRate,
      failureRate: stats?.failureRate,
      lastReceiptAt: stats?.lastReceiptAt,
      totalCalls: stats?.totalCalls ?? 0,
      requiredAutomationLevel,
      leaseStatus,
      lastHeartbeatAt: c.lastHeartbeatAt?.toISOString(),
    };
  });
}

/**
 * 连接器执行结果契约接口
 * 用于在执行函数中增加返回 ActionReceipt 的能力（渐进接入）
 */
export interface ConnectorExecutionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  receipt?: ActionReceipt;
}

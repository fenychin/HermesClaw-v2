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
import type { Connector, ConnectorHealth, ConnectorLease } from "@/types";
import type { ActionReceipt } from "@hermesclaw/event-contracts";
import { randomUUID } from "crypto";

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

/**
 * 根据连接器 category + name 推断认证类型。
 * 当 DB config.authType 为 null 时作为 fallback。
 */
function inferAuthType(
  category: string,
  name: string,
): 'none' | 'apikey' | 'oauth2' | 'basic' | 'webhook-secret' {
  const n = name.toLowerCase();
  // OAuth2：常见需要授权的云服务
  if (
    n.includes('gmail') || n.includes('outlook') || n.includes('google') ||
    n.includes('notion') || n.includes('hubspot') || n.includes('github') ||
    n.includes('discord') || n.includes('slack')
  ) return 'oauth2';
  // Webhook secret：消息推送类
  if (n.includes('webhook') || n.includes('whatsapp') || n.includes('群发')) return 'webhook-secret';
  // API Key：其余 API/数据/ERP 连接器
  if (category === 'api' || category === 'erp' || category === 'data') return 'apikey';
  // CRM/IM 多数使用 oauth2
  if (category === 'crm' || category === 'im') return 'oauth2';
  // email 类 fallback
  if (category === 'email') return 'apikey';
  return 'none';
}

/**
 * 根据 requiredAutomationLevel 推断风险等级。
 * L1 → low, L2 → medium, L3/L4 → high
 */
function inferRiskLevel(
  automationLevel: string | null | undefined,
): 'low' | 'medium' | 'high' {
  if (automationLevel === 'L3' || automationLevel === 'L4') return 'high';
  if (automationLevel === 'L2') return 'medium';
  return 'low';
}

/** 根据 DB 中真实 ConnectorLease 记录 + health 字段推导线上的 lease 状态 */
async function inferLeaseStatus(
  connectorId: string,
  workspaceId: string,
  health: string | undefined | null,
  status: string,
  lastHeartbeatAt?: string | null,
): Promise<"active" | "expired" | "revoked" | "none"> {
  // 1. 优先查真实 ConnectorLease 记录
  const activeLease = await prisma.connectorLease.findFirst({
    where: {
      workspaceId,
      connectorId,
      status: "active",
      expiresAt: { gt: new Date() },
    },
    orderBy: { expiresAt: "desc" },
  });
  if (activeLease) return "active";

  // 2. 检查是否有已过期的租约
  const expiredLease = await prisma.connectorLease.findFirst({
    where: {
      workspaceId,
      connectorId,
      status: "expired",
    },
  });
  if (expiredLease) return "expired";

  // 3. Fallback: 基于心跳推断
  if (status === "error") return "revoked";
  if (!lastHeartbeatAt) return "none";
  const lastHb = new Date(lastHeartbeatAt).getTime();
  const now = Date.now();
  if (now - lastHb > 30_000) return "expired";
  if (health === "healthy" || health === "active") return "active";
  return "none";
}

// ─── 租约管理（真实 ConnectorLease CRUD）──────────────────────────────────

/** 获取连接器的当前活跃租约 */
export async function getActiveLease(
  workspaceId: string,
  connectorId: string,
): Promise<ConnectorLease | null> {
  const row = await prisma.connectorLease.findFirst({
    where: {
      workspaceId,
      connectorId,
      status: "active",
      expiresAt: { gt: new Date() },
    },
    orderBy: { expiresAt: "desc" },
  });
  if (!row) return null;
  return mapLeaseRow(row);
}

/** 获取连接器的所有租约记录（最近 N 条） */
export async function listLeases(
  workspaceId: string,
  connectorId: string,
  limit = 10,
): Promise<ConnectorLease[]> {
  const rows = await prisma.connectorLease.findMany({
    where: { workspaceId, connectorId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(mapLeaseRow);
}

/** 获取连接器租约 — 含状态过滤 */
export async function getLeasesByStatus(
  workspaceId: string,
  connectorId: string,
  status: string,
  limit = 10,
): Promise<ConnectorLease[]> {
  const rows = await prisma.connectorLease.findMany({
    where: { workspaceId, connectorId, status },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(mapLeaseRow);
}

/** 获取连接器租约 */
export async function getLeaseById(leaseId: string): Promise<ConnectorLease | null> {
  const row = await prisma.connectorLease.findUnique({ where: { leaseId } });
  if (!row) return null;
  return mapLeaseRow(row);
}

/** 申请租约（创建 ConnectorLease 记录） */
export async function acquireLease(params: {
  workspaceId: string
  connectorId: string
  taskId?: string
  runtimeId?: string
  scope?: string[]
  maxRiskLevel?: string
  ttlMinutes?: number
}): Promise<ConnectorLease> {
  const {
    workspaceId,
    connectorId,
    taskId = null,
    runtimeId = "openclaw-runtime",
    scope = ["read"],
    maxRiskLevel = "medium",
    ttlMinutes = 60,
  } = params;

  const leaseId = `lease_${randomUUID().slice(0, 16)}`;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  const row = await prisma.connectorLease.create({
    data: {
      leaseId,
      workspaceId,
      connectorId,
      taskId,
      runtimeId,
      scope: JSON.stringify(scope),
      maxRiskLevel,
      status: "active",
      grantedAt: new Date(),
      expiresAt,
      version: "1.0.0",
    },
  });

  return mapLeaseRow(row);
}

/** 释放租约（标记为 revoked） */
export async function releaseLease(leaseId: string): Promise<ConnectorLease | null> {
  const existing = await prisma.connectorLease.findUnique({ where: { leaseId } });
  if (!existing) return null;

  const row = await prisma.connectorLease.update({
    where: { leaseId },
    data: { status: "revoked" },
  });
  return mapLeaseRow(row);
}

/** 吊销连接器的所有活跃租约（连接器断开/故障时使用） */
export async function revokeAllLeases(
  workspaceId: string,
  connectorId: string,
): Promise<number> {
  const result = await prisma.connectorLease.updateMany({
    where: {
      workspaceId,
      connectorId,
      status: "active",
    },
    data: { status: "revoked" },
  });
  return result.count;
}

/** 校验租约是否有效 */
export function checkLeaseValid(
  lease: ConnectorLease | null,
  requiredScope: string,
  riskLevel: string,
): { valid: boolean; reason?: string } {
  if (!lease) {
    return { valid: false, reason: "无有效租约" };
  }
  if (lease.status !== "active") {
    return { valid: false, reason: `租约状态为 ${lease.status}` };
  }
  if (new Date(lease.expiresAt).getTime() < Date.now()) {
    return { valid: false, reason: "租约已过期" };
  }
  if (!lease.scope.includes(requiredScope)) {
    return { valid: false, reason: `租约作用域不包含 ${requiredScope}（当前: ${lease.scope.join(", ")}）` };
  }
  const riskOrder = ["low", "medium", "high", "critical"];
  const leaseRiskIndex = riskOrder.indexOf(lease.maxRiskLevel);
  const requiredRiskIndex = riskOrder.indexOf(riskLevel);
  if (leaseRiskIndex < requiredRiskIndex) {
    return { valid: false, reason: `租约风险等级不足（允许: ${lease.maxRiskLevel}，需要: ${riskLevel}）` };
  }
  return { valid: true };
}

/** 自动清理过期租约（定时任务调用） */
export async function expireStaleLeases(workspaceId: string): Promise<number> {
  const result = await prisma.connectorLease.updateMany({
    where: {
      workspaceId,
      status: "active",
      expiresAt: { lt: new Date() },
    },
    data: { status: "expired" },
  });
  return result.count;
}

/** DB 行 → ConnectorLease 前端类型 */
function mapLeaseRow(row: any): ConnectorLease {
  let scope: string[] = [];
  try {
    scope = typeof row.scope === "string" ? JSON.parse(row.scope) : row.scope ?? [];
  } catch { /* keep default */ }

  return {
    leaseId: row.leaseId,
    connectorId: row.connectorId,
    workspaceId: row.workspaceId,
    taskId: row.taskId ?? undefined,
    runtimeId: row.runtimeId,
    grantedAt: row.grantedAt instanceof Date ? row.grantedAt.toISOString() : row.grantedAt,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
    scope,
    maxRiskLevel: row.maxRiskLevel as ConnectorLease["maxRiskLevel"],
    status: row.status as ConnectorLease["status"],
    version: row.version,
  };
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

  return Promise.all(connectors.map(async (c) => {
    const serialized = serializeConnector(c as unknown as Record<string, unknown>);
    const permissions = (serialized.permissions || []) as string[];
    const stats = statsMap.get(c.id);
    // 解析 config JSON（可能为 null）
    const configObj = (c.config as Record<string, unknown> | null) ?? null;

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

    // 5. 租用状态（异步：优先查真实 ConnectorLease 记录）
    const leaseStatus = await inferLeaseStatus(
      c.id,
      workspaceId,
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
      // ── 安全状态层字段：优先从 config JSON 读取，config=null 时启发式推断 ──
      authType: (configObj?.authType as Connector['authType']) ?? inferAuthType(c.category, c.name),
      riskLevel: (configObj?.riskLevel as Connector['riskLevel']) ?? inferRiskLevel(requiredAutomationLevel),
      requiresApproval: (configObj?.requiresApproval as boolean | undefined) ?? (requiredAutomationLevel === 'L3' || requiredAutomationLevel === 'L4'),
    } as Connector;
  }));
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

// PERF: DB 查询合并 — 3次串行查询 → 最多1次（缓存未命中时）+ 启动时1次默认workspace校验

/**
 * 多租户 Workspace 工具集
 * —— 提供 workspaceId 解析、RBAC 门禁、权限判定
 * —— 在 Prisma 查询层强制数据隔离，不依赖应用层过滤
 *
 * ⚠️ 本文件导入 prisma / auth / logger，仅限服务端使用。
 *    客户端组件如需使用角色/权限判定（isAdmin / WorkspaceRole 等），
 *    请从 @/lib/workspace-roles 导入（纯函数，零服务端依赖）。
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// 本地引用 + 向外部重导出（保持向后兼容：其他模块仍可从 @/lib/workspace 导入这些）
import {
  WORKSPACE_ROLES,
  isWritable,
  canApproveL3,
  canModifyHarness,
  isAdmin,
  hasMinRole,
} from "@/lib/workspace-roles";
import type { WorkspaceRole } from "@/lib/workspace-roles";

export {
  WORKSPACE_ROLES,
  isWritable,
  canApproveL3,
  canModifyHarness,
  isAdmin,
  hasMinRole,
};
export type { WorkspaceRole };

// ==============================
// 会话解析（内部函数，复用 session）
// ==============================

interface ResolvedSession {
  userId: string;
  role: string;
}

async function resolveSession(): Promise<ResolvedSession | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;
    return { userId: session.user.id, role: session.user.role };
  } catch (err) {
    logger.warn("[workspace] auth() 解析失败，回退为未登录状态", {
      error: err instanceof Error ? err.message : "未知错误",
    });
    return null;
  }
}

function isDevAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.DEV_BYPASS_AUTH === "true";
}

// ==============================
// 合并查询：单次 DB 同时取 workspaceId + role
// ==============================

/**
 * 单次 DB 查询同时获取 workspaceId + role，替代原先两次串行查询。
 *
 * - 有 headerWorkspaceId：`findUnique` 精确匹配（已知 workspaceId，O(1) 主键查找）
 * - 无 headerWorkspaceId：`findFirst` 按 userId 找第一条成员记录，同时获取 workspaceId
 *
 * 返回 null 表示无有效成员关系，调用方回退 workspaceId="default" / role="VIEWER"。
 */
async function resolveWorkspaceMembershipFull(
  session: ResolvedSession,
  headerWorkspaceId?: string,
): Promise<{ workspaceId: string; role: WorkspaceRole } | null> {
  try {
    if (headerWorkspaceId) {
      // 已知 workspaceId → findUnique（主键，最快路径）
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: headerWorkspaceId,
            userId: session.userId,
          },
        },
      });
      return membership
        ? { workspaceId: headerWorkspaceId, role: membership.role as WorkspaceRole }
        : null;
    } else {
      // 未知 workspaceId → findFirst，同时取回 workspaceId 和 role（原来两次查询合并为一次）
      const membership = await prisma.workspaceMember.findFirst({
        where: { userId: session.userId },
        orderBy: { workspaceId: "asc" },
      });
      return membership
        ? { workspaceId: membership.workspaceId, role: membership.role as WorkspaceRole }
        : null;
    }
  } catch (err) {
    logger.warn("[workspace] 查询 WorkspaceMember 失败，回退默认 workspace", {
      error: err instanceof Error ? err.message : "未知错误",
      userId: session.userId,
    });
    return null;
  }
}

// ==============================
// 公共 API
// ==============================

/** 获取当前用户在当前 workspace 中的角色 */
export async function getCurrentRole(request?: Request): Promise<WorkspaceRole> {
  const session = await resolveSession();
  if (!session) return "VIEWER";

  const headerWorkspaceId = request?.headers.get("x-workspace-id") ?? undefined;
  const membership = await resolveWorkspaceMembershipFull(session, headerWorkspaceId);
  return membership?.role ?? "VIEWER";
}

// ==============================
// 请求上下文缓存（减少 SQLite 串行查询）
// ==============================

/**
 * 主缓存：key = `userId::workspaceId`，value = WorkspaceContext + expiresAt
 * —— 缓存命中路径：auth() 一次 → 二级索引重建 key → 命中 → 0 次 DB 查询
 */
interface CachedCtx {
  ctx: WorkspaceContext;
  expiresAt: number;
}

const workspaceCtxCache = new Map<string, CachedCtx>();
const WORKSPACE_CTX_CACHE_TTL = 300_000; // 5 分钟（角色变更极少，减少 DB 查询）

/**
 * 二级索引：userId → { workspaceId, expiresAt }
 *
 * 作用：当请求不带 x-workspace-id header 时，无需 DB 查询即可重建主缓存的 key。
 * 写入时与主缓存同步更新，TTL 保持一致。
 */
const userWorkspaceIndex = new Map<string, { workspaceId: string; expiresAt: number }>();

/**
 * 在主缓存中查找 WorkspaceContext。
 * 若无 headerWorkspaceId，先通过二级索引推导 workspaceId，再查主缓存。
 * 完全不触发任何 DB 查询。
 */
function tryGetCachedCtx(
  userId: string,
  headerWorkspaceId?: string,
): WorkspaceContext | undefined {
  // 确定 cache key 所需的 workspaceId
  let wsId: string | undefined = headerWorkspaceId;

  if (!wsId) {
    // 无 header → 通过二级索引还原用户上次使用的 workspaceId
    const idx = userWorkspaceIndex.get(userId);
    if (idx && idx.expiresAt > Date.now()) {
      wsId = idx.workspaceId;
    }
  }

  if (!wsId) return undefined; // 二级索引也未命中（首次请求），需要走 DB

  const key = `${userId}::${wsId}`;
  const cached = workspaceCtxCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ctx;
  }
  // 过期清理
  workspaceCtxCache.delete(key);
  return undefined;
}

/**
 * 写入主缓存 + 同步更新二级索引。
 */
function putCachedCtx(
  userId: string,
  workspaceId: string,
  ctx: WorkspaceContext,
): void {
  const key = `${userId}::${workspaceId}`;
  const expiresAt = Date.now() + WORKSPACE_CTX_CACHE_TTL;
  workspaceCtxCache.set(key, { ctx, expiresAt });
  // 二级索引：记录该用户最近一次使用的 workspaceId
  userWorkspaceIndex.set(userId, { workspaceId, expiresAt });
}

// ==============================
// 请求上下文（Route Handler 使用）
// ==============================

export interface WorkspaceContext {
  workspaceId: string;
  role: WorkspaceRole;
  userId?: string;
  /** 行业包 ID（从 WorkspaceSettings 推导，供 kernel 传入，禁止硬编码） */
  industryId?: string;
}

/**
 * 从请求构建 workspace 上下文（供 Route Handler 使用）
 *
 * 查询路径（性能优化后）：
 *   缓存命中：auth() × 1 → 二级索引重建 key → 主缓存命中 → 返回（DB 查询 = 0）
 *   缓存未命中：auth() × 1 → resolveWorkspaceMembershipFull × 1（DB 查询 ≤ 1）
 *
 * default workspace 存在性校验已移至 prisma.ts 启动时执行，不再每次请求重复校验。
 */
export async function buildWorkspaceContext(request: Request): Promise<WorkspaceContext> {
  const session = await resolveSession();
  const headerWorkspaceId = request.headers.get("x-workspace-id") ?? undefined;

  // ── 开发 bypass（无 session 时快速返回，不查 DB）────────────────
  if (!session && isDevAuthBypassEnabled()) {
    return {
      workspaceId: headerWorkspaceId ?? "default",
      role: "OWNER",
      userId: "dev-bypass-user",
      industryId: "foreign-trade",
    };
  }

  // ── 缓存命中：完全跳过所有 DB 查询 ──────────────────────────────
  if (session) {
    const cached = tryGetCachedCtx(session.userId, headerWorkspaceId);
    if (cached) return cached;
  }

  // ── 缓存未命中：单次合并 DB 查询 ────────────────────────────────
  let workspaceId: string = headerWorkspaceId ?? "default";
  let role: WorkspaceRole = "VIEWER";

  if (session) {
    const membership = await resolveWorkspaceMembershipFull(session, headerWorkspaceId);
    if (membership) {
      workspaceId = membership.workspaceId;
      role = membership.role;
    }
    // membership 为 null：workspaceId 保持 headerWorkspaceId 或 "default"，role 保持 "VIEWER"
  }

  // TODO: 未来从 WorkspaceSettings 或 IndustryPackInstallation 推导 industryId
  const industryId = "foreign-trade";

  const ctx: WorkspaceContext = { workspaceId, role, userId: session?.userId, industryId };

  // 写入主缓存 + 二级索引
  if (session) {
    putCachedCtx(session.userId, workspaceId, ctx);
  }

  return ctx;
}

// ==============================
// Prisma 查询过滤辅助
// ==============================

/** 返回 Prisma where 条件中的 workspaceId 过滤 */
export function workspaceWhere(workspaceId: string): { workspaceId: string } {
  return { workspaceId };
}

// ==============================
// RBAC 门禁
// ==============================

export class ForbiddenError extends Error {
  constructor(message = "权限不足") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * 断言当前用户满足最低角色要求，否则抛 ForbiddenError。
 */
export function requireRole(role: WorkspaceRole, minRole: WorkspaceRole): void {
  if (!hasMinRole(role, minRole)) {
    throw new ForbiddenError(
      `需要 ${minRole} 或更高权限，当前角色为 ${role}`,
    );
  }
}

/** 断言可写（非 VIEWER） */
export function requireWritable(role: WorkspaceRole): void {
  if (!isWritable(role)) {
    throw new ForbiddenError("VIEWER 角色不可执行写操作");
  }
}

/** 断言可修改 Harness（仅 ADMIN/OWNER） */
export function requireHarnessAdmin(role: WorkspaceRole): void {
  if (!canModifyHarness(role)) {
    throw new ForbiddenError("仅 ADMIN 或 OWNER 可修改 Harness 配置");
  }
}

/**
 * RBAC 门禁便捷封装：检查角色 → 不满足则返回 403 Response，满足返回 null。
 * 消除重复的 try { requireRole } catch { return errorResponse } 模式。
 */
export function guardRole(
  role: WorkspaceRole,
  minRole: WorkspaceRole,
  message?: string,
): Response | null {
  if (!hasMinRole(role, minRole)) {
    return Response.json(
      { success: false, error: message ?? `需要 ${minRole} 或更高权限` },
      { status: 403 },
    );
  }
  return null;
}

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

/** 从 session + 请求头解析 workspaceId */
async function resolveWorkspaceId(
  session: ResolvedSession | null,
  request?: Request,
): Promise<string> {
  // 优先从请求头获取
  if (request) {
    const headerWs = request.headers.get("x-workspace-id");
    if (headerWs) return headerWs;
  }

  // 从 session 查找用户所属的第一个 workspace
  if (session) {
    try {
      const membership = await prisma.workspaceMember.findFirst({
        where: { userId: session.userId },
        orderBy: { workspaceId: "asc" },
      });
      if (membership) return membership.workspaceId;
    } catch (err) {
      logger.warn("[workspace] 查询 WorkspaceMember 失败，回退默认 workspace", {
        error: err instanceof Error ? err.message : "未知错误",
        userId: session.userId,
      });
    }
  }

  return "default";
}

/**
 * 单次查询同时获取 workspaceId + role（避免 buildWorkspaceContext 二次查询）。
 * 返回 null 表示用户无有效 workspace 成员关系。
 */
async function resolveWorkspaceMembership(
  session: ResolvedSession,
  workspaceId: string,
): Promise<{ role: WorkspaceRole } | null> {
  try {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: session.userId,
        },
      },
    });
    return membership ? { role: membership.role as WorkspaceRole } : null;
  } catch (err) {
    logger.warn("[workspace] 查询成员角色失败", {
      error: err instanceof Error ? err.message : "未知错误",
      userId: session.userId,
      workspaceId,
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

  const workspaceId = await resolveWorkspaceId(session, request);
  const membership = await resolveWorkspaceMembership(session, workspaceId);
  return membership?.role ?? "VIEWER";
}

// ==============================
// 请求上下文缓存（减少 SQLite 串行查询）
// ==============================

/**
 * 轻量 TTL 缓存：避免同一 session 的多个并行 API 请求
 * 各自独立调用 buildWorkspaceContext 导致 SQLite 串行瓶颈。
 * 缓存 key = userId，TTL = 30 秒（session 角色变更不会太频繁）。
 */
interface CachedCtx {
  ctx: WorkspaceContext;
  expiresAt: number;
}

const workspaceCtxCache = new Map<string, CachedCtx>();
const WORKSPACE_CTX_CACHE_TTL = 300_000; // 5 分钟（角色变更极少，减少 DB 查询）

function getCachedWorkspaceContext(session: ResolvedSession, workspaceId: string): WorkspaceContext | undefined {
  const key = `${session.userId}::${workspaceId}`;
  const cached = workspaceCtxCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ctx;
  }
  workspaceCtxCache.delete(key);
  return undefined;
}

function setCachedWorkspaceContext(session: ResolvedSession, workspaceId: string, ctx: WorkspaceContext): void {
  const key = `${session.userId}::${workspaceId}`;
  workspaceCtxCache.set(key, { ctx, expiresAt: Date.now() + WORKSPACE_CTX_CACHE_TTL });
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
 * —— 内置 TTL 缓存：同一 session 的后续请求直接命中缓存，减少 SQLite 串行查询
 * —— resolveWorkspaceId + resolveWorkspaceMembership 合并为最多 2 次 DB 查询
 */
export async function buildWorkspaceContext(request: Request): Promise<WorkspaceContext> {
  const session = await resolveSession();
  const workspaceId = await resolveWorkspaceId(session, request);

  // 开发 bypass
  if (!session && isDevAuthBypassEnabled()) {
    return {
      workspaceId,
      role: "OWNER",
      userId: "dev-bypass-user",
      industryId: "foreign-trade",
    };
  }

  // TTL 缓存命中（同一个 userId + workspaceId）
  if (session) {
    const cached = getCachedWorkspaceContext(session, workspaceId);
    if (cached) return cached;
  }

  let role: WorkspaceRole = "VIEWER";
  if (session) {
    const membership = await resolveWorkspaceMembership(session, workspaceId);
    if (membership) {
      role = membership.role;
    }
  }

  // 默认 workspace 存在性校验（轻量，仅 default 触发）
  if (workspaceId === "default") {
    try {
      const ws = await prisma.workspace.findUnique({ where: { id: "default" } });
      if (!ws) {
        logger.error("[workspace] 默认 Workspace 不存在，数据库未初始化");
      }
    } catch (err) {
      logger.warn("[workspace] 默认 Workspace 查询失败", {
        error: err instanceof Error ? err.message : "未知错误",
      });
    }
  }

  // TODO: 未来从 WorkspaceSettings 或 IndustryPackInstallation 推导 industryId
  const industryId = "foreign-trade";

  const ctx: WorkspaceContext = { workspaceId, role, userId: session?.userId, industryId };

  // 写入缓存
  if (session) {
    setCachedWorkspaceContext(session, workspaceId, ctx);
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

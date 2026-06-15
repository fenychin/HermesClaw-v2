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

// ==============================
// 公共 API
// ==============================

/** 获取当前用户在当前 workspace 中的角色 */
export async function getCurrentRole(request?: Request): Promise<WorkspaceRole> {
  const session = await resolveSession();
  if (!session) return "VIEWER";

  try {
    const workspaceId = await resolveWorkspaceId(session, request);
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: session.userId,
        },
      },
    });
    return (membership?.role as WorkspaceRole) ?? "VIEWER";
  } catch (err) {
    logger.warn("[workspace] 查询用户角色失败，降级为 VIEWER", {
      error: err instanceof Error ? err.message : "未知错误",
      userId: session.userId,
    });
    return "VIEWER";
  }
}

// ==============================
// 请求上下文（Route Handler 使用）
// ==============================

export interface WorkspaceContext {
  workspaceId: string;
  role: WorkspaceRole;
  userId?: string;
}

/**
 * 从请求构建 workspace 上下文（供 Route Handler 使用）
 * —— 仅调用 auth() 一次，session 复用传入子函数
 */
export async function buildWorkspaceContext(request: Request): Promise<WorkspaceContext> {
  const session = await resolveSession();
  const workspaceId = await resolveWorkspaceId(session, request);

  let role: WorkspaceRole = "VIEWER";
  if (session) {
    try {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: session.userId,
          },
        },
      });
      role = (membership?.role as WorkspaceRole) ?? "VIEWER";
    } catch (err) {
      logger.warn("[workspace] buildWorkspaceContext 查询角色失败", {
        error: err instanceof Error ? err.message : "未知错误",
        userId: session.userId,
        workspaceId,
      });
    }
  }

  // 默认 workspace 存在性校验
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

  return { workspaceId, role, userId: session?.userId };
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

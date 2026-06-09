/**
 * 多租户 Workspace 工具集
 * —— 提供 workspaceId 解析、RBAC 门禁、权限判定
 * —— 在 Prisma 查询层强制数据隔离，不依赖应用层过滤
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ==============================
// WorkspaceRole 枚举 & 权限矩阵
// ==============================

/** 工作空间角色（TEXT 列存，SQLite 无原生 enum） */
export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** 角色优先级数值（越大权限越高） */
const ROLE_PRIORITY: Record<WorkspaceRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

// ==============================
// 权限判定函数
// ==============================

/** 是否具有写权限（非 VIEWER） */
export function isWritable(role: WorkspaceRole): boolean {
  return role !== "VIEWER";
}

/** 是否可审批 L3 提案（至少 MEMBER） */
export function canApproveL3(role: WorkspaceRole): boolean {
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY.MEMBER;
}

/** 是否可修改 Harness（仅 ADMIN/OWNER） */
export function canModifyHarness(role: WorkspaceRole): boolean {
  return role === "ADMIN" || role === "OWNER";
}

/** 是否为管理员（ADMIN/OWNER） */
export function isAdmin(role: WorkspaceRole): boolean {
  return role === "ADMIN" || role === "OWNER";
}

/** 检查角色是否满足最低要求 */
export function hasMinRole(role: WorkspaceRole, minRole: WorkspaceRole): boolean {
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY[minRole];
}

// ==============================
// 会话 / Header 解析
// ==============================

/** 从当前会话或请求头解析 workspaceId */
export async function getWorkspaceId(request?: Request): Promise<string> {
  // 优先从请求头获取（中间件注入）
  if (request) {
    const headerWs = request.headers.get("x-workspace-id");
    if (headerWs) return headerWs;
  }

  // 从 session 获取（用户最后活跃的 workspace）
  try {
    const session = await auth();
    if (session?.user?.id) {
      // 查找用户所属的第一个 workspace
      const membership = await prisma.workspaceMember.findFirst({
        where: { userId: session.user.id },
        orderBy: { workspaceId: "asc" },
      });
      if (membership) return membership.workspaceId;
    }
  } catch {
    // 静默回退
  }

  // 最终回退到默认 workspace
  return "default";
}

/** 获取当前用户在当前 workspace 中的角色 */
export async function getCurrentRole(request?: Request): Promise<WorkspaceRole> {
  try {
    const session = await auth();
    if (!session?.user?.id) return "VIEWER";

    const workspaceId = await getWorkspaceId(request);
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: session.user.id,
        },
      },
    });
    return (membership?.role as WorkspaceRole) ?? "VIEWER";
  } catch {
    return "VIEWER";
  }
}

/** 获取当前用户在当前 workspace 中的成员信息 */
export async function getCurrentMembership(request?: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;

    const workspaceId = await getWorkspaceId(request);
    return await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: session.user.id,
        },
      },
    });
  } catch {
    return null;
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

/** 从请求构建 workspace 上下文（供 Route Handler 使用） */
export async function buildWorkspaceContext(request: Request): Promise<WorkspaceContext> {
  const workspaceId = await getWorkspaceId(request);
  const role = await getCurrentRole(request);
  const session = await auth().catch(() => null);
  return { workspaceId, role, userId: session?.user?.id };
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
 * 用法：
 *   const ctx = await buildWorkspaceContext(request)
 *   requireRole(ctx.role, "MEMBER")  // VIEWER 将被拒绝
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

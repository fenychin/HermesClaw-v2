/**
 * 工作空间角色与权限判定（纯函数，零依赖）
 * —— 从 workspace.ts 中提取，客户端组件可安全导入
 * —— 不依赖 prisma / auth / logger 等服务端模块
 */

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

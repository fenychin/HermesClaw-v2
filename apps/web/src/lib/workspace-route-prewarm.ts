"use client";

/**
 * 路由预热工具（v3.27 简化版）
 *
 * 原用于预加载 dynamic(() => import("./page-client")) chunk，
 * v3.27 已将 page-client 改为直接 import，chunk 随路由 bundle 一同加载，
 * 不再需要单独的 dynamic chunk 预热。
 *
 * 保留函数签名兼容现有调用点（sidebar.tsx / app-shell.tsx），
 * router.prefetch 由 SidebarNavItem 的 onPointerEnter 自行处理。
 */

/** 已降级为 no-op：page-client 已直接 import，无需预热 */
export function prewarmWorkspaceRoute(_href: string) {
  // no-op
}

/** 已降级为 no-op：page-client 已直接 import，无需预热 */
export function prewarmWorkspaceRoutes() {
  // no-op
}

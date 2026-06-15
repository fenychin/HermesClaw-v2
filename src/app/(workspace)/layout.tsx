import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceOverlays } from "@/components/layout/workspace-overlays";
import { Toaster } from "@/components/ui/sonner";

/**
 * 工作台路由组布局：所有一级模块共享左侧导航外壳
 * —— WorkspaceOverlays 为客户端组件，负责全局键盘快捷键与浮层
 * —— Next.js loading.tsx 会在路由切换时自动包裹 Suspense 并展示骨架屏
 */
export default function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AppShell>
      {children}
      <WorkspaceOverlays />
      <Toaster richColors closeButton position="bottom-right" />
    </AppShell>
  );
}

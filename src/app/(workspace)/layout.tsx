import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceOverlays } from "@/components/layout/workspace-overlays";
import { Toaster } from "@/components/ui/sonner";
import { SkeletonCard } from "@/components/common/skeleton-card";

/**
 * 工作台路由组布局：所有一级模块共享左侧导航外壳
 * —— WorkspaceOverlays 为客户端组件，负责全局键盘快捷键与浮层
 * —— Suspense 包裹主内容区，路由切换时展示骨架屏
 */
export default function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="flex-1 space-y-4 p-6">
            <SkeletonCard variant="card" />
            <SkeletonCard variant="card" />
            <SkeletonCard variant="card" />
          </div>
        }
      >
        {children}
      </Suspense>
      <WorkspaceOverlays />
      <Toaster richColors closeButton position="bottom-right" />
    </AppShell>
  );
}

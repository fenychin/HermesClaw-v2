import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceOverlays } from "@/components/layout/workspace-overlays";
import { Toaster } from "@/components/ui/sonner";

/**
 * 工作台路由组布局：所有一级模块共享左侧导航外壳
 * —— 新增服务端 Onboarding 路由守卫：已登录但无工作区绑定关系的用户强制重定向
 */
export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  // 1. 检查 Session
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // 2. 检查用户是否仍然存在（数据库重建后旧 JWT 里的 userId 可能已失效）
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  if (!user) {
    // 用户已不存在（数据库重建场景），强制重新登录以刷新 JWT
    redirect("/login");
  }

  // 3. 检查是否完成 Onboarding（是否有关联工作空间）
  const member = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
  });

  if (!member) {
    redirect("/onboarding");
  }

  return (
    <AppShell>
      {children}
      <WorkspaceOverlays />
      <Toaster richColors closeButton position="bottom-right" />
    </AppShell>
  );
}

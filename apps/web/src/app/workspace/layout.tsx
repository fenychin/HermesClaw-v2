import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ReactNode } from "react";
import WorkspaceProvider from "./workspace-provider";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  // 1. 检查 Session
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // 2. 检查是否有关联工作空间，如果没有，强制重定向至引导页
  const member = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
  });

  if (!member) {
    redirect("/onboarding");
  }

  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}

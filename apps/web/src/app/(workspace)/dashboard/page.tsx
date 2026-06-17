import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDashboardData } from "@/app/api/dashboard/route";
import DashboardClient from "./dashboard-client";

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

export const revalidate = 60; // 每 60 秒 revalidate 静态缓存

async function getWorkspaceIdForServerComponent() {
  const session = await auth();
  if (session?.user?.id) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      orderBy: { workspaceId: "asc" },
    });
    if (membership) return membership.workspaceId;
  }
  return "default";
}

export default async function DashboardPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const period = searchParams.period || "7d";
  
  let initialData = null;
  try {
    const workspaceId = await getWorkspaceIdForServerComponent();
    initialData = await getDashboardData(workspaceId, period);
  } catch (err) {
    console.error("[DashboardPage] Server side fetch failed:", err);
  }

  return (
    <DashboardClient 
      initialData={initialData} 
      period={period} 
    />
  );
}

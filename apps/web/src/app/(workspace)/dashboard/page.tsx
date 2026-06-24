import { getDashboardOverview } from "@hermesclaw/hermes-kernel";
import { prisma } from "@/lib/prisma";
import DashboardClient from "./dashboard-client";
import type { DashboardData } from "./dashboard-client";

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function DashboardPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const period = searchParams.period || "7d";

  let initialData: DashboardData | null = null;
  try {
    // 先检查 Workspace 是否存在，避免在空 DB 上执行大量聚合查询导致超时
    const ws = await prisma.workspace.findUnique({ where: { id: "default" } });
    if (ws) {
      const raw = await getDashboardOverview(
        { workspaceId: "default", period },
        { prisma } as any,
      );
      initialData = raw as DashboardData;
    }
  } catch {
    // 降级为客户端加载
  }

  return <DashboardClient initialData={initialData} period={period} />;
}

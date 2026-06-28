import { getDashboardOverview } from "@hermesclaw/hermes-kernel";
import { prisma } from "@/lib/prisma";
import { expireStaleCheckpoints } from "@/lib/server/approval";
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

  // 服务端获取待审批计数：先清理过期，再查 pending 总数
  let pendingApprovalCount = 0;
  try {
    await expireStaleCheckpoints("default");
    pendingApprovalCount = await prisma.approvalCheckpoint.count({
      where: { workspaceId: "default", decision: "pending" },
    });
  } catch {
    // 降级，计数为 0
  }

  return (
    <DashboardClient
      initialData={initialData}
      period={period}
      pendingApprovalCount={pendingApprovalCount}
    />
  );
}

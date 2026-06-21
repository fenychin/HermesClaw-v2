import { getDashboardOverview } from "@hermesclaw/hermes-kernel";
import { prisma } from "@/lib/prisma";
import DashboardClient from "./dashboard-client";
import type { DashboardData } from "./dashboard-client";

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

/**
 * Dashboard 页面 — 服务端直取数据
 * ── R5 优化：在 SSR 阶段调用 getDashboardOverview，消除客户端 API 往返
 *    页面 HTML 中已包含完整数据，客户端 hydration 后无需重新请求
 */
export default async function DashboardPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const period = searchParams.period || "7d";

  // 服务端直取数据：利用内存缓存 (30s TTL) + 已优化的批量查询
  let initialData: DashboardData | null = null;
  try {
    const raw = await getDashboardOverview(
      { workspaceId: "default", period },
      { prisma } as any,
    );
    initialData = raw as DashboardData;
  } catch {
    // 数据获取失败时降级为客户端加载模式（initialData=null → 显示骨架屏）
  }

  return (
    <DashboardClient
      initialData={initialData}
      period={period}
    />
  );
}

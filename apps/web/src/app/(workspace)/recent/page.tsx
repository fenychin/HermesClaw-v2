"use client";

import dynamic from "next/dynamic";
import { PageHeader } from "@/components/common/page-header";

/** 最近历史记录列表局部骨架屏占位 */
function RecentRouteSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-pulse">
      <PageHeader title="最近" description="继续最近的对话、任务与项目" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-card/45 border border-border/30 rounded-xl p-3 h-[52px]"
          />
        ))}
      </div>
    </div>
  );
}

// 动态按需懒加载最近历史记录客户端，配置 loading 骨架屏
const RecentPageClient = dynamic(
  () => import("@/components/pages/recent/recent-page-client").then((m) => m.RecentPageClient),
  {
    ssr: false,
    loading: () => <RecentRouteSkeleton />,
  }
);

export default function RecentPage() {
  return <RecentPageClient />;
}

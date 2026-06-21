"use client";

import dynamic from "next/dynamic";
import { PageHeader } from "@/components/common/page-header";

/** 智能体控制面局部骨架屏占位 */
function AgentsRouteSkeleton() {
  return (
    <div className="w-full max-w-7xl mx-auto py-6 px-6">
      <PageHeader title="智能体" description="管理外贸 AI 数字员工" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-card rounded-2xl border border-border p-5 h-[220px] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

// 动态按需懒加载智能体列表客户端组件，消除首屏/返回延迟
const AgentsPageClient = dynamic(() => import("./page-client"), {
  ssr: false,
  loading: () => <AgentsRouteSkeleton />,
});

export default function AgentsPage() {
  return <AgentsPageClient />;
}

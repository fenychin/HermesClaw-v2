"use client";

import dynamic from "next/dynamic";
import { PageHeader } from "@/components/common/page-header";

/** 空间列表局部骨架屏占位 */
function ProjectsRouteSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="空间" description="面向客户 / 订单 / 市场的 AI 工作单元" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-card rounded-2xl border border-border p-5 h-[200px] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

// 动态按需懒加载项目空间组件，消除首屏/返回延迟
const ProjectsPageClient = dynamic(() => import("./page-client"), {
  ssr: false,
  loading: () => <ProjectsRouteSkeleton />,
});

export default function ProjectsPage() {
  return <ProjectsPageClient />;
}

"use client";

import dynamic from "next/dynamic";
import { PageHeader } from "@/components/common/page-header";

/** 智慧大脑控制面局部骨架屏占位 */
function BrainRouteSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="智慧大脑" description="记忆、技能与连接器的控制面中枢" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-card rounded-2xl border border-border p-5 h-[80px] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

// 动态按需懒加载智慧大脑核心组件，禁用 SSR 加速路由跳转
const BrainPageClient = dynamic(() => import("./page-client"), {
  ssr: false,
  loading: () => <BrainRouteSkeleton />,
});

export default function BrainPage() {
  return <BrainPageClient />;
}

"use client";

import dynamic from "next/dynamic";
import { PageHeader } from "@/components/common/page-header";

/** 设置板块局部骨架屏占位图 */
function SettingsRouteSkeleton() {
  return (
    <div className="flex flex-col h-full p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader title="设置" description="企业配置、模型路由、连接器授权与系统偏好" />
      <div className="flex flex-1 gap-8 mt-6 min-h-0 overflow-hidden animate-pulse">
        {/* 左侧导航占位 */}
        <div className="w-48 shrink-0 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-10 bg-accent/40 border border-border/30 rounded-xl"
            />
          ))}
        </div>
        {/* 右侧主面板占位 */}
        <div className="flex-1 bg-card/45 border border-border/30 rounded-2xl p-6 h-[450px]" />
      </div>
    </div>
  );
}

// 动态懒加载设置客户端，禁用 SSR 以加快首次路由响应
const SettingsPageClient = dynamic(() => import("./settings-page-client"), {
  ssr: false,
  loading: () => <SettingsRouteSkeleton />,
});

export default function SettingsPage() {
  return <SettingsPageClient />;
}

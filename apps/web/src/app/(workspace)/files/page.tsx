"use client";

import dynamic from "next/dynamic";
import { PageHeader } from "@/components/common/page-header";

/** 文件管理器局部骨架屏占位 */
function FilesRouteSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="文件" description="企业内容供给链与结构化解析" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-card rounded-xl border border-border p-3 h-[52px] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

// 动态按需懒加载文件管理组件，禁用 SSR 解决首屏延迟
const FilesPageClient = dynamic(() => import("./page-client"), {
  ssr: false,
  loading: () => <FilesRouteSkeleton />,
});

export default function FilesPage() {
  return <FilesPageClient />;
}

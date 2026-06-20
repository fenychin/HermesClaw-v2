"use client";

import FilesPageClient from "./page-client";
import { PageHeader } from "@/components/common/page-header";

function FilesRouteSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="文件" description="企业内容供给链与结构化解析" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-3 h-[52px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function FilesPage() {
  return <FilesPageClient />;
}

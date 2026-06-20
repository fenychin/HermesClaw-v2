"use client";

import BrainPageClient from "./page-client";
import { PageHeader } from "@/components/common/page-header";

function BrainRouteSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="智慧大脑" description="记忆、技能与连接器的控制面中枢" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-5 h-[80px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function BrainPage() {
  return <BrainPageClient />;
}

"use client";

import AgentsPageClient from "./page-client";
import { PageHeader } from "@/components/common/page-header";

function AgentsRouteSkeleton() {
  return (
    <div className="w-full max-w-7xl mx-auto py-6 px-6">
      <PageHeader title="智能体" description="管理外贸 AI 数字员工" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-5 h-[220px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  return <AgentsPageClient />;
}

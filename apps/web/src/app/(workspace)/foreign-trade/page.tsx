"use client";

import ForeignTradePageClient from "./page-client";
import { PageHeader } from "@/components/common/page-header";

function ForeignTradeRouteSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="外贸工作台" description="今日经营概览" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-5 h-[104px] animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-4 h-[120px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function ForeignTradePage() {
  return <ForeignTradePageClient />;
}

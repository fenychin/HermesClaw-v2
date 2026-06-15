import { PageHeader } from "@/components/common/page-header";

export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="行业动态" description="外贸动态经营与数据概览" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-5 h-[104px] animate-pulse" />
        ))}
      </div>
      <div className="bg-card rounded-2xl border border-border p-4 h-12 animate-pulse" />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl border border-border p-5 h-[300px] animate-pulse" />
        <div className="bg-card rounded-2xl border border-border p-5 h-[300px] animate-pulse" />
      </div>
    </div>
  );
}

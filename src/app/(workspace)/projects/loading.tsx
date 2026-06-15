import { PageHeader } from "@/components/common/page-header";

export default function ProjectsLoading() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="空间" description="面向客户 / 订单 / 市场的 AI 工作单元" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-5 h-[200px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}

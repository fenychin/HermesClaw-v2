/** 外贸工作台 Loading — 零外部依赖 */
export default function ForeignTradeLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="h-7 w-40 bg-accent/40 rounded animate-pulse" />
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

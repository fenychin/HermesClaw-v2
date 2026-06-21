/**
 * 智慧大脑 Loading 骨架屏
 * ── 零外部依赖
 */
export default function BrainLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="h-7 w-40 bg-accent/40 rounded animate-pulse" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-5 h-[80px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}

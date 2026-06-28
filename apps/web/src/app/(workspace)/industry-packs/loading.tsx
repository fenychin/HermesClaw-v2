export default function IndustryPacksLoading() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 pb-12">
      {/* 骨架头部 */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-24 bg-accent animate-pulse rounded" />
          <div className="h-4 w-64 bg-accent animate-pulse rounded" />
        </div>
        <div className="h-8 w-16 bg-accent animate-pulse rounded-lg" />
      </div>
      {/* 骨架卡片 */}
      <div className="grid gap-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-card border-border animate-pulse rounded-2xl border p-5 h-44"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 bg-accent rounded-full" />
                <div className="space-y-2">
                  <div className="h-4 w-28 bg-accent rounded" />
                  <div className="h-3 w-48 bg-accent rounded" />
                </div>
              </div>
              <div className="h-8 w-20 bg-accent rounded-lg" />
            </div>
            <div className="mt-4 h-3 w-full bg-accent rounded" />
            <div className="mt-3 flex gap-4">
              <div className="h-3 w-20 bg-accent rounded" />
              <div className="h-3 w-24 bg-accent rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

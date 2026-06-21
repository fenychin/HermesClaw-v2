/** 文件 Loading — 零外部依赖 */
export default function FilesLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="h-7 w-24 bg-accent/40 rounded animate-pulse" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-3 h-[52px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}

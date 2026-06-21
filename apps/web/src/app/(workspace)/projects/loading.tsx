/** 项目空间 Loading — 零外部依赖 */
export default function ProjectsLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="h-7 w-36 bg-accent/40 rounded animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-5 h-[200px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}

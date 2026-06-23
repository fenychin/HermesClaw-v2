/**
 * 行业情报中心加载骨架屏
 *
 * 零外部依赖——仅使用 Tailwind 类名，确保 <1ms 发送首字节。
 * CLAUDE.md §11.3 L0：loading.tsx 禁止导入任何组件库。
 */
export default function Loading() {
  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      {/* 顶栏骨架 */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <div className="h-2.5 w-2.5 rounded-full bg-zinc-800 animate-pulse" />
          <div className="h-3 w-12 bg-zinc-800 rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-zinc-800 animate-pulse" />
              <div className="h-3 w-5 bg-zinc-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-6 w-24 bg-zinc-800 rounded animate-pulse" />
      </div>

      {/* 五板块骨架 */}
      <div className="flex-1 flex gap-2 px-4 py-3">
        {[16, 20, 28, 20, 16].map((flex, i) => (
          <div
            key={i}
            className={`flex-[${flex}] min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3`}
          >
            <div className="h-4 w-20 bg-zinc-800 rounded animate-pulse mb-3" />
            <div className="space-y-2">
              <div className="h-3 w-full bg-zinc-800 rounded animate-pulse" />
              <div className="h-3 w-3/4 bg-zinc-800 rounded animate-pulse" />
              <div className="h-3 w-5/6 bg-zinc-800 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

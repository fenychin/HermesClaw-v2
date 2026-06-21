/**
 * 工作台全局 Loading 骨架屏
 * ── 零外部依赖，确保路由切换时骨架屏可在 <100ms 内渲染
 *    不 import 任何组件库、图标库或状态管理库
 */
export default function WorkspaceLoading() {
  return (
    <div className="flex-1 space-y-4 p-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-accent/40 rounded-2xl border border-border/30 h-[120px] animate-pulse"
        />
      ))}
    </div>
  );
}

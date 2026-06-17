import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  variant: "card" | "list-item" | "stat";
  className?: string;
}

/** 骨架基础块 */
function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-accent",
        className,
      )}
    />
  );
}

/**
 * 骨架屏组件
 * —— 用于页面加载时的占位展示，三种变体覆盖常见场景
 */
export function SkeletonCard({ variant, className }: SkeletonCardProps) {
  /* ---- 卡片骨架 ---- */
  if (variant === "card") {
    return (
      <div
        className={cn(
          "bg-card border-border rounded-card border p-5",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <SkeletonBlock className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-4 w-1/3" />
            <SkeletonBlock className="h-3 w-2/3" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-4/5" />
        </div>
      </div>
    );
  }

  /* ---- 列表项骨架 ---- */
  if (variant === "list-item") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl px-4 py-3",
          className,
        )}
      >
        {/* 左侧圆形骨架 */}
        <SkeletonBlock className="size-10 shrink-0 rounded-full" />
        {/* 右侧两行骨架 */}
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-4 w-1/3" />
          <SkeletonBlock className="h-3 w-2/3" />
        </div>
      </div>
    );
  }

  /* ---- 统计指标骨架 ---- */
  return (
    <div
      className={cn(
        "bg-card border-border rounded-card border p-5",
        className,
      )}
    >
      <SkeletonBlock className="h-4 w-1/3" />
      <SkeletonBlock className="mt-3 h-7 w-1/2" />
      <SkeletonBlock className="mt-2 h-3 w-1/4" />
    </div>
  );
}

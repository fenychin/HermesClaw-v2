import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: { value: number; label: string }; // 正数绿色，负数红色
  icon?: LucideIcon;
  description?: string;
  /** 是否处于加载中，显示骨架屏 */
  isLoading?: boolean;
}

/**
 * 指标卡组件
 * —— 用于大盘和各类数据面板统计展示，支持图标、正负趋势变化及底部说明
 * —— isLoading 时显示骨架屏占位，避免数据跳变
 */
export function StatCard({
  title,
  value,
  change,
  icon: Icon,
  description,
  isLoading = false,
}: StatCardProps) {
  const isPositive = change ? change.value >= 0 : false;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground text-sm font-medium">{title}</span>
        {Icon && (
          <div className="bg-primary/10 text-primary rounded-xl p-2 shrink-0">
            <Icon className="size-5" />
          </div>
        )}
      </div>
      <div className="mt-2">
        {isLoading ? (
          // 骨架屏：数值占位 + 变化行占位
          <>
            <div className="h-8 w-20 bg-accent rounded-lg animate-pulse" />
            <div className="h-4 w-24 bg-accent rounded mt-2 animate-pulse" />
          </>
        ) : (
          <>
            <div className="text-foreground text-2xl font-semibold tracking-tight">
              {typeof value === "number" ? value.toLocaleString() : value}
            </div>
            {change && (
              <div className="flex items-center gap-1.5 mt-1 text-xs">
                <span
                  className={cn(
                    isPositive ? "text-success" : "text-danger"
                  )}
                >
                  {isPositive ? "+" : ""}{change.value}%
                </span>
                <span className="text-muted-foreground">{change.label}</span>
              </div>
            )}
            {description && (
              <p className="text-muted-foreground text-xs mt-1">{description}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}


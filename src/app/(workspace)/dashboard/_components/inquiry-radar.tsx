"use client";

import Link from "next/link";
import { ChevronRight, Radar, AlertTriangle, Bell, Info } from "lucide-react";
import { relativeTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { SkeletonList } from "@/components/common/skeleton-list";
import { Skeleton } from "@/components/ui/skeleton";
import type { InquiryItem } from "@/hooks/use-dashboard-stats";

// ============================================================
// 类型定义
// ============================================================

interface InquiryRadarProps {
  inquiries: InquiryItem[];
  isLoading: boolean;
}

// ============================================================
// 优先级配置（遵循 CLAUDE.md 颜色系统）
// ============================================================

const PRIORITY_CONFIG = {
  high: { label: "HIGH", badgeClass: "bg-danger/10 text-danger" },
  mid: { label: "MEDIUM", badgeClass: "bg-warning/10 text-warning" },
  low: { label: "LOW", badgeClass: "bg-muted text-muted-foreground" },
} as const;

type Priority = keyof typeof PRIORITY_CONFIG;

/** 显示顺序：高 → 中 → 低 */
const PRIORITY_ORDER: Priority[] = ["high", "mid", "low"];

/** 分组图标 */
const PRIORITY_ICON: Record<Priority, typeof AlertTriangle> = {
  high: AlertTriangle,
  mid: Bell,
  low: Info,
};

/** 图标颜色（分组标题行） */
const PRIORITY_ICON_CLASS: Record<Priority, string> = {
  high: "text-danger",
  mid: "text-warning",
  low: "text-muted-foreground",
};

// ============================================================
// 组件
// ============================================================

export function InquiryRadar({ inquiries, isLoading }: InquiryRadarProps) {
  // 按接收时间倒序排列，取前 10 条
  const top10 = [...inquiries]
    .sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    )
    .slice(0, 10);

  // 按优先级分组（仅保留非空分组）
  const grouped = PRIORITY_ORDER.map((priority) => ({
    priority,
    items: top10.filter((i) => i.priority === priority),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      {/* 卡片标题行 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Radar className="size-4 text-brand-blue" />
          <h3 className="text-foreground font-semibold text-base">询盘雷达</h3>
        </div>
        <Link
          href="/foreign-trade"
          className="text-brand-blue hover:underline text-xs flex items-center gap-1"
        >
          查看全部
          <ChevronRight className="size-3" />
        </Link>
      </div>

      {/* 加载骨架 */}
      {isLoading ? (
        <SkeletonList count={5}>
          {(i) => (
            <div
              key={`radar-skel-${i}`}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <Skeleton className="size-8 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-12 rounded-full shrink-0" />
            </div>
          )}
        </SkeletonList>
      ) : grouped.length === 0 ? (
        /* 空状态（温暖提示，遵循 CLAUDE.md §5） */
        <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
          <Radar className="size-8 text-hint" />
          <p className="text-hint text-sm">暂无询盘数据</p>
          <p className="text-hint text-xs">
            新的客户询盘将按优先级自动分组展示在此，助您快速定位高价值商机。
          </p>
        </div>
      ) : (
        /* 优先级分组列表 */
        <div className="space-y-4">
          {grouped.map((group) => {
            const config = PRIORITY_CONFIG[group.priority];
            const Icon = PRIORITY_ICON[group.priority];
            const iconClass = PRIORITY_ICON_CLASS[group.priority];

            return (
              <div key={group.priority}>
                {/* 分组标题：图标 + 优先级名称 + 计数 */}
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={cn("size-3.5", iconClass)} />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {config.label}
                  </span>
                  <span className="text-xs text-hint tabular-nums">
                    {group.items.length}
                  </span>
                </div>

                {/* 分组内询盘行 */}
                <div className="space-y-1">
                  {group.items.map((inquiry) => (
                    <Link
                      key={inquiry.id}
                      href={`/foreign-trade?inquiryId=${inquiry.id}`}
                      className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-xl hover:bg-accent/40 transition-colors group"
                    >
                      {/* 国旗 emoji */}
                      <span
                        className="text-lg leading-none shrink-0 select-none"
                        title={inquiry.fromCountry}
                      >
                        {inquiry.countryFlag}
                      </span>

                      {/* 渠道 + 相对时间 */}
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground capitalize shrink-0">
                          {inquiry.channel}
                        </span>
                        <span className="text-xs text-hint tabular-nums shrink-0">
                          {relativeTime(inquiry.receivedAt)}
                        </span>
                      </div>

                      {/* 优先级标签 */}
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wide",
                          config.badgeClass,
                        )}
                      >
                        {config.label}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

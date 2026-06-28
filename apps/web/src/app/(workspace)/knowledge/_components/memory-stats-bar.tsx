"use client";

import { memo } from "react";
import { Target, Crosshair, Shield, Layers, TrendingUp } from "lucide-react";
import { SkeletonCard } from "@/components/common/skeleton-card";
import { cn } from "@/lib/utils";
import type { MemoryStats } from "@/types";

interface MemoryStatsBarProps {
  stats: (MemoryStats & { memoryCounts?: Record<string, number>; frozenCount?: number }) | null;
  loading?: boolean;
}

/**
 * 记忆命中统计条 — 展示 hitRate / missCount / memoryCounts / frozenCount
 * —— 所有数据来自 MemoryAccessLog 聚合，禁止前端计算假数字
 */
export const MemoryStatsBar = memo(function MemoryStatsBar({
  stats,
  loading,
}: MemoryStatsBarProps) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} variant="stat" />
        ))}
      </div>
    );
  }

  const items = [
    {
      label: "命中率",
      value: `${Math.round(stats.hitRate * 100)}%`,
      sub: `${stats.hitCount} 次命中`,
      icon: Target,
      color: stats.hitRate >= 0.7 ? "text-success" : stats.hitRate >= 0.4 ? "text-warning" : "text-danger",
      bg: stats.hitRate >= 0.7 ? "bg-success/10" : stats.hitRate >= 0.4 ? "bg-warning/10" : "bg-danger/10",
    },
    {
      label: "未命中",
      value: `${stats.missCount}`,
      sub: "次未命中",
      icon: Crosshair,
      color: "text-muted-foreground",
      bg: "bg-accent",
    },
    {
      label: "总访问",
      value: `${stats.totalAccess}`,
      sub: "次记忆召回",
      icon: TrendingUp,
      color: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "记忆总量",
      value: `${(stats.memoryCounts?.short ?? 0) + (stats.memoryCounts?.mid ?? 0) + (stats.memoryCounts?.long ?? 0)}`,
      sub: `短${stats.memoryCounts?.short ?? 0} · 中${stats.memoryCounts?.mid ?? 0} · 长${stats.memoryCounts?.long ?? 0}`,
      icon: Layers,
      color: "text-brand",
      bg: "bg-brand/10",
    },
    {
      label: "已冻结",
      value: `${stats.frozenCount ?? 0}`,
      sub: "条受保护记忆",
      icon: Shield,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-card border border-border rounded-xl p-4 flex items-center gap-3"
        >
          <div className={cn("flex size-10 items-center justify-center rounded-xl shrink-0", item.bg)}>
            <item.icon className={cn("size-5", item.color)} />
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-[11px] truncate">{item.label}</p>
            <p className="text-foreground text-lg font-bold">{item.value}</p>
            <p className="text-hint text-[10px] truncate">{item.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
});

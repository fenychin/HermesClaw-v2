"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { TrendIndicator } from "@/types/dashboard";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: { value: number; label: string }; // 正数绿色，负数红色
  icon?: LucideIcon;
  description?: string;
  /** 是否处于加载中，显示骨架屏 */
  isLoading?: boolean;
  /** 迷你趋势数据（7 天序列），传入后显示在数值下方 */
  sparklineData?: number[];
  /** 趋势方向 + 百分比 */
  trend?: TrendIndicator;
  /** 点击钻取目标路由，传入后整卡变为可点击 Link */
  drillDownHref?: string;
}

/** SVG 迷你折线图（Sparkline）—— 极简实现，无外部依赖 */
function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;

  const width = 80;
  const height = 32;
  const padding = 2;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);

  // 计算点坐标
  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const range = max - min || 1;
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  // 判断整体趋势用于颜色
  const firstHalf = data.slice(0, Math.floor(data.length / 2));
  const secondHalf = data.slice(Math.floor(data.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const strokeColor =
    secondAvg > firstAvg ? "var(--success)" : secondAvg < firstAvg ? "var(--danger)" : "var(--hint)";

  // 填充区域路径
  const areaPath = `${points.join(" L ")} ${width - padding},${height - padding} ${padding},${height - padding} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-20 h-8 shrink-0"
      aria-hidden="true"
    >
      {/* 半透明填充 */}
      <path
        d={areaPath}
        fill={strokeColor}
        fillOpacity={0.08}
      />
      {/* 折线 */}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 指标卡组件
 * —— 用于大盘和各类数据面板统计展示，支持图标、正负趋势变化、迷你趋势线及钻取。
 */
export function StatCard({
  title,
  value,
  change,
  icon: Icon,
  description,
  isLoading = false,
  sparklineData,
  trend,
  drillDownHref,
}: StatCardProps) {
  const isPositive = change ? change.value >= 0 : false;

  const trendArrow =
    trend?.direction === "up" ? "↑"
    : trend?.direction === "down" ? "↓"
    : null;

  const trendColor =
    trend?.direction === "up" ? "text-success"
    : trend?.direction === "down" ? "text-danger"
    : "text-hint";

  const cardContent = (
    <>
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
          <>
            <div className="h-8 w-20 bg-accent rounded-lg animate-pulse" />
            <div className="h-4 w-24 bg-accent rounded mt-2 animate-pulse" />
          </>
        ) : (
          <>
            {/* 数值 + sparkline 行 */}
            <div className="flex items-end justify-between gap-2">
              <motion.span
                key={typeof value === "number" ? value : value}
                initial={{ scale: 1 }}
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="text-foreground text-2xl font-semibold tracking-tight"
              >
                {typeof value === "number" ? value.toLocaleString() : value}
              </motion.span>
              {sparklineData && sparklineData.length > 1 && (
                <Sparkline data={sparklineData} />
              )}
            </div>

            {/* 趋势方向（优先），否则展示 change */}
            {trend && trendArrow ? (
              <div className="flex items-center gap-1.5 mt-1 text-xs">
                <span className={cn("font-bold", trendColor)}>
                  {trendArrow}
                </span>
                <span className={cn(trendColor)}>
                  {trend.percent > 0 ? "+" : ""}{trend.percent}%
                </span>
                <span className="text-muted-foreground">近 7 天趋势</span>
              </div>
            ) : change ? (
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
            ) : null}

            {description && (
              <p className="text-muted-foreground text-xs mt-1">{description}</p>
            )}
          </>
        )}
      </div>
    </>
  );

  // 钻取模式：整卡可点击
  if (drillDownHref) {
    return (
      <Link
        href={drillDownHref}
        className="bg-card rounded-2xl border border-border p-5 flex flex-col justify-between transition-colors hover:bg-accent/30 hover:border-border/80 cursor-pointer"
      >
        {cardContent}
      </Link>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex flex-col justify-between">
      {cardContent}
    </div>
  );
}

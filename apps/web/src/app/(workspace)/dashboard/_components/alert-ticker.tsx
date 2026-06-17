"use client";

/**
 * 告警滚动条 — 大盘顶部横向滚动预警栏
 * —— 展示高影响情报、沉默预警、紧急待办等关键事件。
 * —— 纯 CSS 动画自动滚动，hover 暂停。
 */
import { useRef, useState } from "react";
import { AlertTriangle, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedItem } from "@/types/dashboard";

export interface AlertTickerProps {
  /** 高影响活动流条目 */
  alerts: FeedItem[];
  /** 沉默预警数 */
  silenceCount?: number;
  /** 紧急待办数 */
  urgentCount?: number;
  className?: string;
}

/** 单条告警条目 */
function TickerItem({
  icon,
  label,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs whitespace-nowrap shrink-0 px-3 py-1",
        className,
      )}
    >
      {icon}
      <span>{label}</span>
      {/* 分隔符 */}
      <span className="text-border mx-2 select-none">|</span>
    </span>
  );
}

export default function AlertTicker({
  alerts,
  silenceCount = 0,
  urgentCount = 0,
  className,
}: AlertTickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  // 如果告警内容不足以滚动，则不使用动画
  const needsScroll =
    alerts.length > 0 || silenceCount > 0 || urgentCount > 0;

  if (!needsScroll) {
    return (
      <div
        className={cn(
          "bg-card/60 border border-border/50 rounded-xl px-4 py-2 flex items-center gap-2 text-hint text-xs",
          className,
        )}
      >
        <span className="inline-block size-1.5 rounded-full bg-success" />
        当前无紧急告警
      </div>
    );
  }

  // 构建告警条目列表
  const items: Array<{
    icon: React.ReactNode;
    label: string;
    className: string;
  }> = [];

  // 紧急待办
  if (urgentCount > 0) {
    items.push({
      icon: <AlertTriangle className="size-3 text-danger" />,
      label: `${urgentCount} 项紧急待办`,
      className: "text-danger",
    });
  }

  // 沉默预警
  if (silenceCount > 0) {
    items.push({
      icon: <Users className="size-3 text-warning" />,
      label: `${silenceCount} 个地区存在沉默客户`,
      className: "text-warning",
    });
  }

  // 高影响力情报
  for (const alert of alerts.slice(0, 10)) {
    items.push({
      icon: <TrendingUp className="size-3 text-brand-blue" />,
      label: alert.title.length > 40 ? alert.title.slice(0, 40) + "…" : alert.title,
      className: "text-brand-blue",
    });
  }

  // 为无限滚动效果，复制一份内容
  const doubledItems = [...items, ...items];

  return (
    <div
      className={cn(
        "relative bg-card/80 border border-border/40 rounded-xl overflow-hidden",
        className,
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* 左侧遮罩渐变 */}
      <div className="absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-r from-card/60 to-transparent" />

      {/* 右侧遮罩渐变 */}
      <div className="absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-r from-transparent to-card/60" />

      {/* 滚动内容 */}
      <div
        ref={scrollRef}
        className="flex items-center py-1.5 overflow-hidden"
      >
        <div
          className={cn("flex items-center", isPaused ? "" : "animate-marquee")}
          style={
            isPaused
              ? undefined
              : {
                  animation: "marquee 30s linear infinite",
                }
          }
        >
          {doubledItems.map((item, i) => (
            <TickerItem
              key={i}
              icon={item.icon}
              label={item.label}
              className={item.className}
            />
          ))}
        </div>
      </div>

      {/* 注入 marquee 关键帧（Tailwind v4 无内置 animate-marquee） */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

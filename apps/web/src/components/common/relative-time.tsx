"use client";

import { useSyncExternalStore } from "react";
import { relativeTime } from "@/lib/date-utils";

/** 空订阅：用于水合安全的 isMounted 检测（服务端与首次客户端渲染均为 false） */
const emptySubscribe = () => () => {};

interface RelativeTimeProps {
  /** ISO 时间字符串 */
  value: string;
  /** 容器额外类名（透传至 <time>） */
  className?: string;
}

/**
 * 从 ISO 字符串直接取「M月D日」占位，与时区无关（避免服务端 UTC 与客户端本地时区
 * 经 Date 解析后日期不同导致占位本身水合不匹配）。无法解析时回退空串。
 */
function stableDateLabel(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return "";
  return `${Number(m[2])}月${Number(m[3])}日`;
}

/**
 * 相对时间展示组件（水合安全）
 * —— relativeTime() 依赖 Date.now()，SSR 时刻与客户端水合时刻不同会导致文本不一致，
 *    触发 React Hydration 报错（见 next.js react-hydration-error）。
 * —— 解法：服务端与首次客户端渲染统一输出稳定占位（从 ISO 直取日期、不依赖"现在"、
 *    不依赖时区），挂载后再切换为实时相对时间。首屏两端文本一致 → 无水合不匹配。
 */
export function RelativeTime({ value, className }: RelativeTimeProps) {
  // 服务端 / 首次客户端渲染 → false；挂载后 → true（仅客户端切换，不参与水合比对）
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {isMounted ? relativeTime(value) : stableDateLabel(value)}
    </time>
  );
}

/**
 * 时间格式化工具（共享）
 * —— recent-panel 与 recent-page-client 共用
 */

/** 时间组分类 */
export type TimeGroup = "今天" | "昨天" | "本周" | "更早";

/** 根据时间戳推算时间组 */
export function classifyTimeGroup(isoStr: string): TimeGroup {
  const now = new Date();
  const d = new Date(isoStr);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  if (d >= todayStart) return "今天";
  if (d >= yesterdayStart) return "昨天";
  const weekAgo = new Date(todayStart.getTime() - 7 * 86400000);
  if (d >= weekAgo) return "本周";
  return "更早";
}

/** 相对时间格式化（中文） */
export function relativeTime(isoStr: string): string {
  const now = Date.now();
  const diffMs = now - new Date(isoStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "昨天";
  if (diffDay < 7) return `${diffDay}天前`;
  return new Date(isoStr).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

/** 格式化时间显示（含星期几） */
export function formatTime(isoStr: string, timeGroup: string): string {
  const d = new Date(isoStr);
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");

  if (timeGroup === "今天") {
    return relativeTime(isoStr);
  }

  if (timeGroup === "昨天") {
    return `昨天 ${hours}:${minutes}`;
  }

  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const dayLabel = weekdays[d.getDay()];
  return `${dayLabel} ${hours}:${minutes}`;
}

/** API 对话记录 → 统一 RecentRecord 结构 */
export interface ApiConversation {
  id: string;
  title: string;
  updatedAt: string;
}

export interface UnifiedRecentRecord {
  id: string;
  type: "conversation" | "task" | "project";
  title: string;
  timestamp: string;
  timeGroup: TimeGroup;
}

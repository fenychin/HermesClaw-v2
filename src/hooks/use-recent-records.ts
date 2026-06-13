"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient, type RecentRecordItem } from "@/lib/api-client";
import { classifyTimeGroup, type TimeGroup } from "@/lib/date-utils";

/** 带分组信息的最近记录 */
export interface RecentRecordEnriched extends RecentRecordItem {
  timeGroup: TimeGroup;
  source: string;
}

/** 时间筛选选项 */
export type TimeFilter = "all" | "today" | "yesterday" | "week" | "earlier";

/** 根据时间组匹配筛选 */
export function matchTimeFilter(
  timeGroup: TimeGroup,
  filter: TimeFilter,
): boolean {
  if (filter === "all") return true;
  switch (filter) {
    case "today":
      return timeGroup === "今天";
    case "yesterday":
      return timeGroup === "昨天";
    case "week":
      return timeGroup === "本周";
    case "earlier":
      return timeGroup === "更早";
    default:
      return true;
  }
}

/** 行业选项 */
export const INDUSTRY_OPTIONS = [
  { value: "all", label: "全部行业" },
  { value: "外贸", label: "外贸" },
  { value: "家居", label: "家居" },
  { value: "电子", label: "电子" },
  { value: "机械", label: "机械" },
];

/**
 * 从 meta 推断来源描述（供列表展示）
 * 将 API 返回的结构化 meta 转为人类可读的来源文本
 */
function inferSource(record: RecentRecordItem): string {
  switch (record.type) {
    case "conversation":
      return "Hermes 对话";
    case "task": {
      const status = record.meta?.status as string | undefined;
      const statusLabel =
        status === "IN_PROGRESS"
          ? "进行中"
          : status === "DONE"
            ? "已完成"
            : "待处理";
      return `任务 · ${statusLabel}`;
    }
    case "project": {
      const country = record.meta?.country as string | undefined;
      const pType = record.meta?.projectType as string | undefined;
      return `项目空间${pType ? ` · ${pType}` : ""}${country ? ` · ${country}` : ""}`;
    }
    case "file":
      return "文件上传";
    case "upgrade": {
      const risk = record.meta?.riskLevel as string | undefined;
      return `Harness 升级 · ${risk === "high" ? "高风险" : risk === "medium" ? "中风险" : "低风险"}`;
    }
    default:
      return "未知来源";
  }
}

/**
 * 共享 Hook：从 /api/recent 获取聚合最近记录
 * —— 使用 TanStack Query 缓存，staleTime 30s
 */
export function useRecentRecords(type = "all", industry?: string) {
  return useQuery({
    queryKey: ["recent-records", type, industry],
    queryFn: async () => {
      const { records } = await apiClient.getRecent(type, industry);
      return records.map(
        (r): RecentRecordEnriched => ({
          ...r,
          timeGroup: classifyTimeGroup(r.timestamp),
          source: inferSource(r),
        }),
      );
    },
    staleTime: 30_000,
    // 聚合查询单次重试即可（任一子查询失败时后端已用 allSettled 部分降级）
    retry: 1,
    // VIEWER 可读；失败不抛出，返回空数组确保页面不崩溃
    placeholderData: (prev) => prev,
  });
}

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

/** 行业选项（当前 AuditLog 模式下暂不可用，保留 UI 兼容） */
export const INDUSTRY_OPTIONS = [
  { value: "all", label: "全部行业" },
];

/** action → 来源描述 */
const ACTION_INFER_MAP: Record<string, string> = {
  "conversation.create": "Hermes 对话 · 新建",
  "conversation.message": "Hermes 对话 · 新消息",
  "task.create": "任务 · 新建",
  "task.dispatch": "任务 · 已派发",
  "task.cancel": "任务 · 已取消",
  "project.create": "项目 · 新建",
  "project.update": "项目 · 更新",
  "project.archive": "项目 · 已归档",
  "workflow.generate": "工作流 · 已生成",
  "workflow.run": "工作流 · 运行中",
  "file.upload": "文件 · 已上传",
  "file.delete": "文件 · 已删除",
  "proposal.create": "提案 · 已提交",
  "proposal.approve": "提案 · 已批准",
  "proposal.reject": "提案 · 已驳回",
  "connector.create": "连接器 · 新建",
  "connector.authorize": "连接器 · 已授权",
  "connector.execute": "连接器 · 已执行",
  "approval.requested": "审批 · 待处理",
  "approval.resolved": "审批 · 已通过",
  "approval.rejected": "审批 · 已驳回",
};

/**
 * 从 action 推断来源描述
 * —— 优先匹配已知 action 标签，fallback 到 action 原始值
 */
function inferSource(record: RecentRecordItem): string {
  if (record.action && ACTION_INFER_MAP[record.action]) {
    return ACTION_INFER_MAP[record.action];
  }
  // fallback：旧版兼容
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
    case "workflow":
      return "工作流";
    case "connector":
      return "连接器";
    case "approval":
      return "审批";
    case "upgrade": {
      const risk = record.meta?.riskLevel as string | undefined;
      return `Harness 升级 · ${risk === "high" ? "高风险" : risk === "medium" ? "中风险" : "低风险"}`;
    }
    default:
      return record.action ?? "未知来源";
  }
}

/**
 * 共享 Hook：从 /api/recent 获取聚合最近记录（AuditLog 真相源）
 * —— TanStack Query 缓存，staleTime 5s，refetchInterval 10s
 * —— enabled 参数控制是否发起查询（侧边栏折叠时禁用）
 */
export function useRecentRecords(type = "all", enabled = true) {
  return useQuery({
    queryKey: ["recent-records", type],
    queryFn: async () => {
      const { records } = await apiClient.getRecent(type);
      return records.map(
        (r): RecentRecordEnriched => ({
          ...r,
          timeGroup: classifyTimeGroup(r.timestamp),
          source: inferSource(r),
        }),
      );
    },
    enabled,
    staleTime: 5_000,           // 5s 内视为新鲜
    refetchInterval: enabled ? 10_000 : false,  // 禁用时停止轮询
    retry: 1,
    placeholderData: (prev) => prev,
  });
}

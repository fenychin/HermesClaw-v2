"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { classifyTimeGroup } from "@/lib/date-utils";

/**
 * 最近的记录类型（统一定义 — sidebar-recent 使用）
 *
 * @deprecated 新代码请使用 api-client 中的 RecentRecordItem.type（5 种），
 *             侧边栏迁移至 /api/recent 聚合端点后将移除此定义。
 */
export type RecentType = "conversation" | "task" | "project";

export interface RecentRecord {
  id: string;
  type: RecentType;
  title: string;
  timestamp: string;
  /**
   * 可选导航目标：存在时点击直接跳转该路由（用于询盘派生「对话」等无真实对话记录的项）；
   * 为空且 type==="conversation" 时按真实对话 ID 加载历史会话。
   */
  href?: string;
  /** 时间分组（供 /recent 页面归组展示，侧边栏忽略） */
  timeGroup?: string;
}

/**
 * 从 API 获取真实对话列表，映射为 RecentRecord 并附带 timeGroup 分组。
 * 供 sidebar-recent 使用。
 *
 * @param includeTimeGroup 是否附带 timeGroup（侧边栏不需要）
 * @returns RecentRecord[] — API 真实对话
 */
export function mapApiConversations(
  convs: Array<{ id: string; title: string; updatedAt: string }>,
  includeTimeGroup = false,
): RecentRecord[] {
  return convs.map((c) => {
    const record: RecentRecord = {
      id: c.id,
      type: "conversation",
      title: c.title,
      timestamp: c.updatedAt,
    };
    if (includeTimeGroup) {
      record.timeGroup = classifyTimeGroup(c.updatedAt);
    }
    return record;
  });
}

/**
 * QueryKey 常量，供外部模块复用以共享同一份缓存。
 * 侧边栏与任何其他页面使用相同 key 时，TanStack Query 会自动 dedup 请求。
 */
export const RECENT_CONVERSATIONS_QUERY_KEY = [
  "recent-conversations",
] as const;

/**
 * 共享 Hook：从 API 加载真实对话列表 + 监听 conversation-saved 事件自动刷新
 *
 * 迁移至 TanStack Query：
 * - staleTime 30s：侧边栏反复展开/折叠不重复请求
 * - gcTime 5min：路由切换期间缓存保留，/recent 页面命中同一 key 时不再发起请求
 * - refetchOnWindowFocus false：切回窗口不自动触发重取，减少无感知网络开销
 */
export function useRecentConversations(enabled = true) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: RECENT_CONVERSATIONS_QUERY_KEY,
    queryFn: async () => {
      const res = (await apiClient.getConversations()) as {
        conversations: Array<{ id: string; title: string; updatedAt: string }>;
      };
      return mapApiConversations(res.conversations ?? [], true);
    },
    enabled,
    staleTime: 30_000,           // 30 秒内不重复请求
    gcTime: 5 * 60_000,          // 5 分钟内缓存保留（路由切换复用）
    refetchOnWindowFocus: false,  // 切回窗口不自动重取
  });

  // 监听新对话保存事件 → 使缓存失效触发重取（而非直接 fetch）
  useEffect(() => {
    if (!enabled) return;
    const onConversationSaved = () => {
      queryClient.invalidateQueries({
        queryKey: RECENT_CONVERSATIONS_QUERY_KEY,
      });
    };
    window.addEventListener("conversation-saved", onConversationSaved);
    return () =>
      window.removeEventListener("conversation-saved", onConversationSaved);
  }, [enabled, queryClient]);

  return {
    /** 对话列表（向后兼容原有调用方） */
    apiConversations: data ?? [],
    isLoading,
    error,
    /**
     * 向后兼容引用：触发缓存失效重取，而非直接裸 fetch。
     * 现有调用方无需改动。
     */
    fetchConversations: () =>
      queryClient.invalidateQueries({
        queryKey: RECENT_CONVERSATIONS_QUERY_KEY,
      }),
  };
}

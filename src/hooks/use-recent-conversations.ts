"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { classifyTimeGroup } from "@/lib/date-utils";

/**
 * 最近的记录类型（统一定义 — sidebar-recent / recent-panel 共享）
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
 * 供 sidebar-recent / recent-panel 共享使用。
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
 * 共享 Hook：从 API 加载真实对话列表 + 监听 conversation-saved 事件自动刷新
 */
export function useRecentConversations() {
  const [apiConversations, setApiConversations] = useState<RecentRecord[]>([]);

  const fetchConversations = useCallback(() => {
    apiClient
      .getConversations()
      .then((data) => {
        const convs =
          (data as { conversations: Array<{ id: string; title: string; updatedAt: string }> }).conversations ?? [];
        setApiConversations(mapApiConversations(convs, true));
      })
      .catch(() => {
        /* 对话列表加载失败不阻断页面 */
      });
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // 监听新对话保存事件，自动刷新
  useEffect(() => {
    const onConversationSaved = () => {
      fetchConversations();
    };
    window.addEventListener("conversation-saved", onConversationSaved);
    return () =>
      window.removeEventListener("conversation-saved", onConversationSaved);
  }, [fetchConversations]);

  return { apiConversations, fetchConversations };
}

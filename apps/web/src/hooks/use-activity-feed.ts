"use client"

import { useQuery } from "@tanstack/react-query"
import type { FeedItem } from "@/types/dashboard"

// ============================================================
// Hook
// ============================================================

/**
 * 活动流 Hook（Dashboard 外贸动态流使用）
 * —— 合并 MarketIntelligence + AgentLog，按时间戳倒序
 * —— queryKey: ['activity-feed', limit]，staleTime: 60s
 */
export function useActivityFeed(limit = 20) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["activity-feed", limit],
    queryFn: async (): Promise<FeedItem[]> => {
      const res = await fetch(`/api/dashboard/activity-feed?limit=${limit}`)
      if (!res.ok) throw new Error("获取活动流失败")
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? "未知错误")
      return (json.data?.feed ?? []) as FeedItem[]
    },
    staleTime: 60_000,
  })

  return {
    feed: data ?? [],
    isLoading,
    error,
  }
}

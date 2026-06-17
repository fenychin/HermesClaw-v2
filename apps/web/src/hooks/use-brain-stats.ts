"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

/**
 * 智慧大脑（Brain）统计指标与知识缺口查询 Hook
 */
export function useBrainStats() {
  return useQuery({
    queryKey: ["brain-stats"],
    queryFn: () => apiClient.getBrainStats(),
    // 缓存 30 秒以减少频繁请求
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // 每分钟自动刷新一次
  });
}

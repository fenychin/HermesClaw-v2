/**
 * useIntelSnapshot — KPI 快照轮询 Hook
 *
 * 每 30s 轮询 /api/v1/industry/kpi-snapshot，使用 TanStack Query 管理缓存。
 * 服务端返回 IndustryIntelSnapshot（含 radarSection、signalFeed、systemStatus）。
 *
 * 领域规则不在此 Hook 中计算——所有 threatLevel 判定由服务端完成。
 */
"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchKpiSnapshot } from "@/services/api/industry-intel-api"
import type { IndustryIntelSnapshot } from "@/types/industry-intel"

interface UseIntelSnapshotOptions {
  packId: string | null
  /** 轮询间隔（毫秒），默认 30s */
  refetchInterval?: number
}

interface UseIntelSnapshotReturn {
  snapshot: IndustryIntelSnapshot | null
  isLoading: boolean
  error: Error | null
  /** 手动刷新 */
  refetch: () => void
}

export function useIntelSnapshot({
  packId,
  refetchInterval = 30_000,
}: UseIntelSnapshotOptions): UseIntelSnapshotReturn {
  const enabled = packId !== null

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["industry-intel", "kpi-snapshot", packId],
    queryFn: () => fetchKpiSnapshot(packId!),
    enabled,
    refetchInterval,
    staleTime: 25_000,
    retry: 2,
  })

  return {
    snapshot: data ?? null,
    isLoading: enabled && isLoading,
    error: error as Error | null,
    refetch,
  }
}

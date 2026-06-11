"use client"

import { useQuery } from "@tanstack/react-query"

// ==============================
// 类型定义
// ==============================

/** 沉默预警条目 */
export interface SilenceAlert {
  country: string
  countryFlag: string
  /** 该国家最久未回复的天数 */
  silenceDays: number
  /** 该国家未回复询盘总数 */
  count: number
  /** 代表性公司名 */
  sampleCompany: string
}

/** API 响应 */
interface SilenceAlertsResponse {
  alerts: SilenceAlert[]
}

// ==============================
// API 调用
// ==============================

/** 获取沉默预警数据 */
async function fetchSilenceAlerts(): Promise<SilenceAlert[]> {
  const res = await fetch("/api/dashboard/silence-alerts")
  if (!res.ok) throw new Error("获取沉默预警失败")
  const json = (await res.json()) as SilenceAlertsResponse & {
    success: boolean
    error?: string
  }
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.alerts
}

// ==============================
// TanStack Query Hook
// ==============================

/**
 * 沉默预警 Hook
 * —— queryKey: ['silence-alerts', workspaceId]，staleTime: 5min
 * —— 沉默数据变化缓慢，较长 staleTime 减少重复请求
 */
export function useSilenceAlerts(workspaceId = "default") {
  const { data, isLoading, error } = useQuery({
    queryKey: ["silence-alerts", workspaceId],
    queryFn: fetchSilenceAlerts,
    staleTime: 300_000, // 5 分钟
  })

  return {
    alerts: data ?? [],
    isLoading,
    error,
    /** 是否有沉默预警 */
    hasAlerts: (data?.length ?? 0) > 0,
  }
}

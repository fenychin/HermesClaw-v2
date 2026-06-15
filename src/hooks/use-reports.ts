"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { buildUrl, type QueryParams } from "@/hooks/use-query-factory"
import type { ReportType } from "@/types/dashboard"

// ==============================
// 类型定义
// ==============================

/** 报告条目（API 序列化后） */
export interface ReportItem {
  id: string
  workspaceId: string
  type: ReportType
  /** LLM 生成的 Markdown 内容 */
  content: string
  /** 生成时间（ISO 字符串） */
  generatedAt: string
  /** 生成时使用的数据快照（JSON 字符串） */
  dataSnapshot: string
  createdAt: string
}

/** 生成报告返回 */
export interface GenerateReportResult {
  id: string
  type: ReportType
  content: string
  generatedAt: string
}

/** 报告列表 API 响应（经 ApiResponse.ok 包裹：{ success, data: { reports } }） */
interface ReportListResponse {
  data: { reports: ReportItem[] }
}

// ==============================
// API 调用
// ==============================

/** 获取报告列表 */
async function fetchReports(
  type?: ReportType,
  limit = 5,
): Promise<ReportItem[]> {
  const params: QueryParams = {}
  if (type) params.type = type
  if (limit) params.limit = String(limit)

  const url = buildUrl(
    "/api/packs/foreign-trade/reports",
    Object.keys(params).length > 0 ? params : undefined,
  )
  const res = await fetch(url)
  if (!res.ok) throw new Error("获取报告列表失败")
  const json = (await res.json()) as ReportListResponse & {
    success: boolean
    error?: string
  }
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.data.reports
}

/** 触发生成报告 */
async function generateReport(type: ReportType = "MORNING"): Promise<GenerateReportResult> {
  const res = await fetch("/api/packs/foreign-trade/reports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  })
  const json = (await res.json()) as {
    success: boolean
    data: GenerateReportResult
    error?: string
  }
  if (!res.ok || !json.success)
    throw new Error(json.error ?? "生成报告失败")
  return json.data
}

// ==============================
// TanStack Query Hooks
// ==============================

const REPORTS_KEY = ["reports"] as const

/**
 * 报告列表 Hook
 * —— queryKey: ['reports', workspaceId, type, limit]
 * —— staleTime: 5min（报告内容静态，无需频繁刷新）
 */
export function useReports(
  type?: ReportType,
  limit = 5,
  workspaceId = "default",
) {
  const { data, isLoading, error } = useQuery({
    queryKey: [...REPORTS_KEY, workspaceId, type ?? "all", limit],
    queryFn: () => fetchReports(type, limit),
    staleTime: 300_000,
  })

  return {
    reports: data ?? [],
    /** 最新一条报告 */
    latest: data?.[0] ?? null,
    isLoading,
    error,
  }
}

/**
 * 生成报告 Mutation Hook
 * —— 成功后自动刷新报告列表缓存
 * —— 支持指定报告类型（MORNING / EVENING / WEEKLY）
 */
export function useGenerateReport(workspaceId = "default") {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (type: ReportType = "MORNING") => generateReport(type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...REPORTS_KEY, workspaceId] })
    },
  })
}

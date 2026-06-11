"use client"

import { useQuery } from "@tanstack/react-query"
import { buildUrl } from "@/hooks/use-query-factory"

// ==============================
// 类型定义
// ==============================

/** 周工作流日聚合 */
export interface WeeklyWorkflowDay {
  day: string      // 周一、周二...
  success: number
  failed: number
}

/** 大盘统计数据 */
export interface DashboardStats {
  todayInquiries: number
  todayInquiriesChange: number
  followingCustomers: number
  pendingTasks: number
  /** 紧急待办数（高优先级 + 未回复询盘） */
  urgentCount: number
  activeProjects: number
  weeklyWorkflowRuns: WeeklyWorkflowDay[]
}

/** 报价列表项（用于外贸页聚合） */
export interface QuotationItem {
  id: string
  projectId: string
  version: number
  totalAmount: string
  currency: string
  status: "draft" | "sent" | "accepted" | "rejected"
  createdAt: string
}

/** 询盘列表项 */
export interface InquiryItem {
  id: string
  fromCountry: string
  countryFlag: string
  companyName: string
  summary: string
  priority: "high" | "mid" | "low"
  channel: string
  receivedAt: string
  replied: boolean
}

// ==============================
// API 调用
// ==============================

/** 获取大盘统计数据 */
async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await fetch("/api/dashboard/stats")
  if (!res.ok) throw new Error("获取大盘统计失败")
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.data as DashboardStats
}

/** 获取报价列表 */
async function fetchQuotations(): Promise<QuotationItem[]> {
  const res = await fetch("/api/quotations")
  if (!res.ok) throw new Error("获取报价列表失败")
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.data.quotations as QuotationItem[]
}

/** 询盘 API 筛选参数 */
export interface InquiryFilters {
  fromCountry?: string
  stage?: string
}

/** 获取询盘列表 */
async function fetchInquiries(filters?: InquiryFilters): Promise<InquiryItem[]> {
  const params: Record<string, string | undefined> = {}
  if (filters?.fromCountry) params.fromCountry = filters.fromCountry
  if (filters?.stage && filters.stage !== "all") params.stage = filters.stage
  const url = buildUrl("/api/inquiries", Object.keys(params).length > 0 ? params : undefined)
  const res = await fetch(url)
  if (!res.ok) throw new Error("获取询盘列表失败")
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.data.inquiries as InquiryItem[]
}

// ==============================
// TanStack Query Hooks
// ==============================

/**
 * 大盘统计 Hook（dashboard 页面使用）
 * —— 聚合询盘数、客户数、待办、活跃项目、周工作流图表数据
 * —— queryKey: ['dashboard-stats', workspaceId]，staleTime: 30s
 */
export function useDashboardStats(workspaceId = "default") {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-stats", workspaceId],
    queryFn: fetchDashboardStats,
    staleTime: 30_000,       // 大盘数据允许短暂延迟
  })

  return {
    stats: data ?? null,
    isLoading,
    error,
  }
}

/**
 * 报价列表 Hook
 * —— 用于外贸概览页聚合本月成交金额等指标
 * —— staleTime: 60s
 */
export function useQuotations() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["quotations"],
    queryFn: fetchQuotations,
    staleTime: 60_000,
  })

  return {
    quotations: data ?? [],
    isLoading,
    error,
  }
}

/**
 * 询盘列表 Hook
 * —— 提供原始询盘数据供页面自定义筛选与聚合
 * —— staleTime: 60s
 * —— opts.limit: 客户端截断条数（undefined = 全部返回）
 * —— opts.workspaceId: 用于 queryKey 缓存隔离，默认 "default"
 * —— opts.fromCountry / opts.stage: 服务端 Prisma where 筛选
 */
export function useInquiries(opts?: {
  limit?: number
  workspaceId?: string
  fromCountry?: string
  stage?: string
}) {
  const workspaceId = opts?.workspaceId ?? "default"
  const filters: InquiryFilters = {}
  if (opts?.fromCountry) filters.fromCountry = opts.fromCountry
  if (opts?.stage && opts.stage !== "all") filters.stage = opts.stage

  const { data, isLoading, error } = useQuery({
    queryKey: ["inquiries", workspaceId, filters],
    queryFn: () => fetchInquiries(
      Object.keys(filters).length > 0 ? filters : undefined,
    ),
    staleTime: 60_000,
  })

  const all = data ?? []
  const inquiries = opts?.limit && opts.limit > 0 ? all.slice(0, opts.limit) : all

  return {
    inquiries,
    allInquiries: all,
    isLoading,
    error,
  }
}

// ==============================
// 辅助计算函数
// ==============================

/**
 * 计算本月成交总金额（从报价数据中聚合）
 * —— 筛选本月 accepted 状态的报价，求和 totalAmount
 */
export function computeMonthlyAmount(quotations: QuotationItem[]): number {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  return quotations
    .filter((q) => {
      const createdAt = new Date(q.createdAt)
      return createdAt >= monthStart && (q.status === "accepted" || q.status === "sent")
    })
    .reduce((sum, q) => {
      const amount = parseFloat(q.totalAmount.replace(/[^0-9.]/g, ""))
      return sum + (isNaN(amount) ? 0 : amount)
    }, 0)
}

/**
 * 获取询盘中的紧急数量（priority === 'high'）
 */
export function countUrgentInquiries(inquiries: InquiryItem[]): number {
  return inquiries.filter((i) => i.priority === "high").length
}

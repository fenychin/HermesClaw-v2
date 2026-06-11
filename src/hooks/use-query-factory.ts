"use client"

import { useQuery } from "@tanstack/react-query"

// ============================================================
// TanStack Query 工厂，消除列表类 hook 中的重复样板
// ============================================================

interface QueryListOptions {
  /** useQuery 的 queryKey */
  queryKey: string[]
  /** API 路径 */
  url: string
  /** 从 json.data 中选取数组的字段名（如 "agents"、"skills"、"intelligence"） */
  dataField: string
  /** 错误消息前缀（如 "获取智能体列表"） */
  errorLabel: string
  /** staleTime，默认 60s */
  staleTime?: number
}

/** URL 查询参数映射（undefined 或空字符串的键会被跳过） */
export type QueryParams = Record<string, string | undefined>

/** 构建带查询参数的完整 URL */
export function buildUrl(baseUrl: string, params?: QueryParams): string {
  if (!params) return baseUrl
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") sp.set(k, v)
  })
  const qs = sp.toString()
  return qs ? `${baseUrl}?${qs}` : baseUrl
}

/**
 * 创建列表查询 hook
 * —— 统一 fetch → json 校验 → 数组提取 → useQuery 封装
 * —— 返回 { items, isLoading, error }，调用方可用解构别名重命名 items
 *
 * 用法：
 *   const useAgents = createQueryListHook<AgentItem>({
 *     queryKey: ["agents"], url: "/api/agents",
 *     dataField: "agents", errorLabel: "获取智能体列表",
 *   })
 *   // 组件中: const { items: agents, isLoading } = useAgents()
 *   // 带筛选: const { items } = useAgents({ status: "active" })
 */
export function createQueryListHook<T>(opts: QueryListOptions) {
  const { queryKey, url, dataField, errorLabel, staleTime = 60_000 } = opts

  async function fetchList(params?: QueryParams): Promise<T[]> {
    const fullUrl = buildUrl(url, params)
    const res = await fetch(fullUrl)
    if (!res.ok) throw new Error(`${errorLabel}失败`)
    const json = await res.json()
    if (!json.success) throw new Error(json.error ?? "未知错误")
    return (json.data?.[dataField] ?? []) as T[]
  }

  return function useList(params?: QueryParams) {
    const { data, isLoading, error } = useQuery({
      queryKey: [...queryKey, params ?? {}],
      queryFn: () => fetchList(params),
      staleTime,
    })
    return { items: data ?? [], isLoading, error }
  }
}

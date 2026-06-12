"use client"

import { createQueryListHook } from "@/hooks/use-query-factory"

// ==============================
// 类型定义
// ==============================

export interface AgentItem {
  id: string
  name: string
  description: string
  category: string[]
  status: string
  statsJson: Record<string, unknown>
}

export interface SkillItem {
  id: string
  name: string
  description: string
  version: string
  category: string
  status: string
}

export interface ConnectorItem {
  id: string
  name: string
  description: string
  category: string
  status: string
  provider: string
}

// ==============================
// Hooks（工厂生成）
// ==============================

/** 智能体列表 */
export const useAgents = createQueryListHook<AgentItem>({
  queryKey: ["agents"],
  url: "/api/agents",
  dataField: "agents",
  errorLabel: "获取智能体列表",
  staleTime: 60_000,
})

/** 技能列表 */
export const useSkills = createQueryListHook<SkillItem>({
  queryKey: ["skills"],
  url: "/api/skills",
  dataField: "skills",
  errorLabel: "获取技能列表",
  staleTime: 120_000,
})

/** 连接器列表 */
export const useConnectors = createQueryListHook<ConnectorItem>({
  queryKey: ["connectors"],
  url: "/api/connectors",
  dataField: "connectors",
  errorLabel: "获取连接器列表",
  staleTime: 120_000,
})

// ==============================
// 筛选函数
// ==============================

/** 按分类筛选（数组字段） */
export function filterByCategory<T extends { category: string | string[] }>(
  items: T[],
  target: string,
): T[] {
  return items.filter((item) => {
    const cats = Array.isArray(item.category) ? item.category : [item.category]
    return cats.some((c) => c.toLowerCase().includes(target.toLowerCase()))
  })
}

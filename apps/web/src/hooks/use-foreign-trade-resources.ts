"use client"

// ==============================
// 类型定义（供 use-foreign-trade-capabilities.ts 使用）
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

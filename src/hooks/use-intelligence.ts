"use client"

import { createQueryListHook } from "@/hooks/use-query-factory"
import type { MarketIntelligence } from "@/types/trade"

// ==============================
// Hook（工厂生成）
// ==============================

/**
 * 市场情报 Hook（外贸页行业动态 / 风险提醒面板使用）
 * —— queryKey: ['intelligence']，staleTime: 60s
 */
export const useIntelligence = createQueryListHook<MarketIntelligence>({
  queryKey: ["intelligence"],
  url: "/api/packs/foreign-trade/intelligence",
  dataField: "intelligence",
  errorLabel: "获取市场情报",
  staleTime: 60_000,
})

// ==============================
// 辅助筛选函数
// ==============================

/**
 * 从情报列表筛选风险提醒项
 * —— 关税 / 物流 / 竞品 类型，且影响等级为 high/mid，视为需提醒的风险
 */
export function filterRiskItems(
  intelligence: MarketIntelligence[],
): MarketIntelligence[] {
  const RISK_TYPES: MarketIntelligence["type"][] = ["tariff", "logistics", "competitor"]
  return intelligence.filter(
    (i) => RISK_TYPES.includes(i.type) && i.impactLevel !== "low",
  )
}

/** 从情报列表筛选汇率类情报（currency 类型） */
export function filterCurrencyItems(
  intelligence: MarketIntelligence[],
): MarketIntelligence[] {
  return intelligence.filter((i) => i.type === "currency")
}

"use client"

import { createQueryListHook } from "@/hooks/use-query-factory"

// ==============================
// 类型定义
// ==============================

/** 汇率监测项 */
export interface ExchangeRateItem {
  id: string
  pair: string
  value: number
  change24h: number
  updatedAt: string
}

// ==============================
// Hook（工厂生成）
// ==============================

/**
 * 汇率监测 Hook（外贸页汇率卡片使用）
 * —— queryKey: ['exchange-rates']，staleTime: 60s
 */
export const useExchangeRates = createQueryListHook<ExchangeRateItem>({
  queryKey: ["exchange-rates"],
  url: "/api/exchange-rates",
  dataField: "rates",
  errorLabel: "获取汇率监测",
  staleTime: 60_000,
})

"use client"

import { useState, useEffect } from "react"
import type { TradeWorkflow } from "@/app/(workspace)/foreign-trade/_components/workflow-types"

interface CapabilitiesResponse {
  workflows?: unknown[]
  agents?: unknown[]
}

/**
 * 拉取外贸 pack 的能力清单（workflow 卡片元数据）。
 *
 * P1-5 重构：移除了静态 TRADE_WORKFLOWS fallback —— pack 是 SoT，
 * API 失败时返回空数组，UI 自带 EmptyState 渲染兜底。
 */
export function useForeignTradeCapabilities() {
  const [workflows, setWorkflows] = useState<TradeWorkflow[]>([])

  useEffect(() => {
    let active = true
    fetch("/api/industry/foreign-trade/capabilities")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`)
        }
        return res.json() as Promise<CapabilitiesResponse>
      })
      .then((data) => {
        if (!active) return
        if (data && Array.isArray(data.workflows) && data.workflows.length > 0) {
          // 卫语句：校验是否每一个工作流元素都是含有 id 的合法对象
          const isValid = data.workflows.every(
            (w) =>
              w &&
              typeof w === "object" &&
              "id" in w &&
              typeof (w as Record<string, unknown>).id === "string",
          )
          if (isValid) {
            setWorkflows(data.workflows as TradeWorkflow[])
          } else {
            console.warn("[useForeignTradeCapabilities] Invalid workflow items from API")
            setWorkflows([])
          }
        } else {
          setWorkflows([])
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        console.error("Failed to fetch capabilities:", message)
        if (active) setWorkflows([])
      })

    return () => {
      active = false
    }
  }, [])

  return workflows
}


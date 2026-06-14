"use client"

import { useState, useEffect } from "react"
import { TRADE_WORKFLOWS } from "@/app/(workspace)/foreign-trade/_data/workflows"
import type { TradeWorkflow } from "@/app/(workspace)/foreign-trade/_data/workflows"

interface CapabilitiesResponse {
  workflows?: unknown[]
  agents?: unknown[]
}

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
        if (active && data && Array.isArray(data.workflows) && data.workflows.length > 0) {
          // 卫语句：校验是否每一个工作流元素都是合法的含有 id 属性的对象，防止属性缺失导致崩溃
          const isValid = data.workflows.every(
            (w) => w && typeof w === "object" && "id" in w && typeof (w as Record<string, unknown>).id === "string"
          )
          if (isValid) {
            setWorkflows(data.workflows as TradeWorkflow[])
          } else {
            console.warn("[useForeignTradeCapabilities] Invalid workflow items from API, falling back")
            setWorkflows(TRADE_WORKFLOWS)
          }
        } else if (active) {
          // 资产加载为空时降级兜底
          setWorkflows(TRADE_WORKFLOWS)
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        console.error("Failed to fetch capabilities, fallback to static config:", message)
        if (active) {
          // API 彻底宕机时采用静态 Fallback
          setWorkflows(TRADE_WORKFLOWS)
        }
      })

    return () => {
      active = false
    }
  }, [])

  return workflows
}

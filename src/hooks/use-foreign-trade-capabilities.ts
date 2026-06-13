"use client"

import { useState, useEffect } from "react"
import { TRADE_WORKFLOWS } from "@/app/(workspace)/foreign-trade/_data/workflows"
import type { TradeWorkflow } from "@/app/(workspace)/foreign-trade/_data/workflows"

export function useForeignTradeCapabilities() {
  const [workflows, setWorkflows] = useState<TradeWorkflow[]>(TRADE_WORKFLOWS)

  useEffect(() => {
    let active = true
    fetch("/api/industry/foreign-trade/capabilities")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`)
        }
        return res.json()
      })
      .then((data) => {
        if (active && data && Array.isArray(data.workflows)) {
          // 根据 API 返回的 workflows ID 列表过滤已有的静态数据
          const idSet = new Set(data.workflows)
          const filtered = TRADE_WORKFLOWS.filter((wf) => idSet.has(wf.id))
          if (filtered.length > 0) {
            setWorkflows(filtered)
          }
        }
      })
      .catch((err) => {
        console.error("Failed to fetch capabilities, fallback to static config", err)
      })

    return () => {
      active = false
    }
  }, [])

  return workflows
}

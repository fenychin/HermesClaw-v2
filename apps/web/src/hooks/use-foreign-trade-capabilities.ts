"use client"

import { useState, useEffect } from "react"
import type { TradeWorkflow } from "@/app/(workspace)/foreign-trade/_components/workflow-types"
import type { AgentItem, SkillItem, ConnectorItem } from "@/hooks/use-foreign-trade-resources"

interface CapabilitiesResponse {
  workflows?: unknown[]
  agents?: unknown[]
  skills?: unknown[]
  connectors?: unknown[]
  dashboards?: unknown[]
  schemas?: unknown[]
  evalRules?: unknown[]
}

export function useForeignTradeCapabilities() {
  const [data, setData] = useState<{
    workflows: TradeWorkflow[]
    agents: AgentItem[]
    skills: SkillItem[]
    connectors: ConnectorItem[]
    dashboards: any[]
    isLoading: boolean
  }>({
    workflows: [],
    agents: [],
    skills: [],
    connectors: [],
    dashboards: [],
    isLoading: true,
  })

  useEffect(() => {
    let active = true
    fetch("/api/industry/foreign-trade/capabilities")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`)
        }
        return res.json() as Promise<CapabilitiesResponse>
      })
      .then((resData) => {
        if (!active) return
        setData({
          workflows: (resData.workflows || []) as TradeWorkflow[],
          agents: (resData.agents || []) as AgentItem[],
          skills: (resData.skills || []) as SkillItem[],
          connectors: (resData.connectors || []).flat() as ConnectorItem[],
          dashboards: (resData.dashboards || []) as any[],
          isLoading: false,
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        console.error("Failed to fetch capabilities:", message)
        if (active) {
          setData((prev) => ({ ...prev, isLoading: false }))
        }
      })

    return () => {
      active = false
    }
  }, [])

  return data
}



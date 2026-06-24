/**
 * IndustryIntelligencePage — 行业情报中心大屏页面
 *
 * 五板块布局（16/20/28/20/16），顶栏 + 面板 + 全局浮层。
 *
 * PERF(v3.42.05): 移除 IntelStreamProvider Context 推送模式。
 * 改用 IntelEventBus 事件总线——各面板独立订阅自己关心的 SSE 事件，
 * 互不触发对方重渲染。彻底消除"一个 flow tick → 8 个面板全重渲染"问题。
 */
"use client"

import React, { useEffect } from "react"
import { IntelTopBar } from "@/components/pages/industry-intel-topbar"
import { Panel1StrategicAwareness } from "@/components/pages/panel-1-strategic-awareness"
import { Panel2DataFlux } from "@/components/pages/panel-2-data-flux"
import { Panel3NebulaCoreMap } from "@/components/pages/panel-3-nebula-core-map"
import { Panel4SimulationSandbox } from "@/components/pages/panel-4-simulation-sandbox"
import { Panel5EvolutionCore } from "@/components/pages/panel-5-evolution-core"
import { ThreatAlertModal } from "@/components/pages/threat-alert-modal"
import { CommandTicker } from "@/components/pages/command-ticker"
import { useIndustryIntelStore } from "@/stores/industry-intel-store"
import { useAgentHeartbeat } from "@/hooks/use-agent-heartbeat"

const DEFAULT_INDUSTRIES = [
  { id: "industry-intelligence-v2", name: "跨行业舆情", packId: "industry-intelligence-v2", isIntelCenter: true },
]

export default function IndustryIntelligencePage() {
  const setActiveIndustry = useIndustryIntelStore((s) => s.setActiveIndustry)
  const setIndustryOptions = useIndustryIntelStore((s) => s.setIndustryOptions)
  const industryOptions = useIndustryIntelStore((s) => s.industryOptions)
  const activeIndustryId = useIndustryIntelStore((s) => s.activeIndustryId)

  useEffect(() => {
    if (industryOptions.length === 0) setIndustryOptions(DEFAULT_INDUSTRIES)
    if (!activeIndustryId) setActiveIndustry(DEFAULT_INDUSTRIES[0].id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useAgentHeartbeat()

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-300" role="main" aria-label="行业舆情">
      <IntelTopBar />

      <div className="flex-1 flex gap-2 px-4 py-3 overflow-hidden pb-8">
        <div className="flex-[16] min-w-0"><Panel1StrategicAwareness /></div>
        <div className="flex-[20] min-w-0"><Panel2DataFlux /></div>
        <div className="flex-[28] min-w-0"><Panel3NebulaCoreMap /></div>
        <div className="flex-[20] min-w-0"><Panel4SimulationSandbox /></div>
        <div className="flex-[16] min-w-0"><Panel5EvolutionCore /></div>
      </div>

      <ThreatAlertModal />
      <CommandTicker />
    </div>
  )
}

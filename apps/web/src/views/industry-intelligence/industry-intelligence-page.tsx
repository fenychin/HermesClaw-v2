/**
 * IndustryIntelligencePage — 行业情报中心大屏页面
 *
 * 五板块布局（16/20/28/20/16），顶栏 + 面板 + 全局浮层。
 * 三域原则：此页面只做视图组合，所有数据通过 hooks 获取。
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
import { useIntelStream } from "@/hooks/use-intel-stream"
import { useAgentHeartbeat } from "@/hooks/use-agent-heartbeat"

// ─── 占位行业列表（Phase 3 硬编码，Phase 4 从 API 获取） ──────────────

const DEFAULT_INDUSTRIES = [
  { id: "industry-intelligence-v2", name: "跨行业情报中心", packId: "industry-intelligence-v2", isIntelCenter: true },
]

export default function IndustryIntelligencePage() {
  const activeIndustryId = useIndustryIntelStore((s) => s.activeIndustryId)
  const setActiveIndustry = useIndustryIntelStore((s) => s.setActiveIndustry)
  const setIndustryOptions = useIndustryIntelStore((s) => s.setIndustryOptions)
  const industryOptions = useIndustryIntelStore((s) => s.industryOptions)

  // 初始化行业列表
  useEffect(() => {
    if (industryOptions.length === 0) {
      setIndustryOptions(DEFAULT_INDUSTRIES)
    }
    if (!activeIndustryId) {
      setActiveIndustry(DEFAULT_INDUSTRIES[0].id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // SSE 连接
  useIntelStream({ packId: activeIndustryId })

  // Agent 心跳检测
  useAgentHeartbeat()

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-300" role="main" aria-label="行业情报中心">
      {/* 顶栏 */}
      <IntelTopBar />

      {/* 五板块布局（桌面端 16/20/28/20/16） */}
      <div className="flex-1 flex gap-2 px-4 py-3 overflow-hidden pb-8">
        {/* P1 战略态势感知 16% */}
        <div className="flex-[16] min-w-0" role="region" aria-label="战略态势感知板块">
          <Panel1StrategicAwareness />
        </div>

        {/* P2 数据流量动力学 20% */}
        <div className="flex-[20] min-w-0" role="region" aria-label="数据流量动力学板块">
          <Panel2DataFlux />
        </div>

        {/* P3 行业生态星云 28% */}
        <div className="flex-[28] min-w-0" role="region" aria-label="行业生态星云板块">
          <Panel3NebulaCoreMap />
        </div>

        {/* P4 决策推演沙盘 20% */}
        <div className="flex-[20] min-w-0" role="region" aria-label="决策推演沙盘板块">
          <Panel4SimulationSandbox />
        </div>

        {/* P5 人机进化核心 16% */}
        <div className="flex-[16] min-w-0" role="region" aria-label="人机进化核心板块">
          <Panel5EvolutionCore />
        </div>
      </div>

      {/* 全局浮层 */}
      <ThreatAlertModal />
      <CommandTicker />
    </div>
  )
}

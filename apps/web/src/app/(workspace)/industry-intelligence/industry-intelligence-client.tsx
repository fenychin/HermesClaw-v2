"use client"

import dynamic from "next/dynamic"

const IndustryIntelligencePage = dynamic(
  () => import("@/views/industry-intelligence/industry-intelligence-page"),
  { ssr: false },
)

export default function IndustryIntelligenceClient() {
  return <IndustryIntelligencePage />
}

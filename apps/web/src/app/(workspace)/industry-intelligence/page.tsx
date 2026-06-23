import type { Metadata } from "next"
import IndustryIntelligenceClient from "./industry-intelligence-client"

export const metadata: Metadata = {
  title: "行业情报中心",
  description: "行业特种作战情报中心 v2.0 — 五板块实时情报中枢大屏",
}

export default function Page() {
  return <IndustryIntelligenceClient />
}

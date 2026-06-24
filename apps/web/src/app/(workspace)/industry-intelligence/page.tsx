import type { Metadata } from "next"
import IndustryIntelligenceClient from "./industry-intelligence-client"

export const metadata: Metadata = {
  title: "行业舆情",
  description: "行业舆情 v2.0 — 五板块实时情报中枢大屏",
}

export default function Page() {
  return <IndustryIntelligenceClient />
}

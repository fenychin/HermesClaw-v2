import type { Metadata } from "next"
import { MarketingNav } from "@/components/marketing/MarketingNav"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"

export const metadata: Metadata = {
  title: "HermesClaw — 面向中小企业的 AI 数字员工操作系统",
  description:
    "HermesClaw：可规划、可执行、可记忆、可治理、可审计、可回滚的 AI 数字员工平台。三域架构 + Industry Pack 行业插件，为企业构建可被治理的 AI 系统。",
  keywords: [
    "AI数字员工",
    "外贸AI",
    "智能体",
    "HermesClaw",
    "Harness",
    "三域架构",
    "AI治理",
  ],
  authors: [{ name: "HermesClaw Team" }],
  creator: "HermesClaw",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "HermesClaw",
    title: "HermesClaw — 面向中小企业的 AI 数字员工操作系统",
    description: "可规划 · 可执行 · 可记忆 · 可治理 · 可审计 · 可回滚",
  },
}

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="bg-[#0A0A0F] text-white min-h-screen">
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  )
}

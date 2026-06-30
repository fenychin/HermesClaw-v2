import { HeroSection } from "@/components/marketing/HeroSection"
import { ProblemSection } from "@/components/marketing/ProblemSection"
import { ArchitectureSection } from "@/components/marketing/ArchitectureSection"
import { IndustryPackSection } from "@/components/marketing/IndustryPackSection"
import { GovernanceSection } from "@/components/marketing/GovernanceSection"
import { CTASection } from "@/components/marketing/CTASection"

export const dynamic = "force-static"

/**
 * 营销落地页 — 完全还原 hermesclaw-marketing.html 设计稿
 * 所有样式使用 inline style + <style> 标签，匹配参考 HTML 的每一处 CSS 属性
 */
export default function MarketingPage() {
  return (
    <>
      <HeroSection />
      <ProblemSection />
      <ArchitectureSection />
      <IndustryPackSection />
      <GovernanceSection />
      <CTASection />
    </>
  )
}

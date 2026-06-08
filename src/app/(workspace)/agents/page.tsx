"use client";

import { PageTransition } from "@/components/common/PageTransition";
import { AgentsPageClient } from "@/components/pages/agents/agents-page-client";

/** 智能体中心（PRD 10.4）—— 左右双栏布局：列表 | 详情 */
export default function AgentsPage() {
  return (
    <PageTransition>
      <AgentsPageClient />
    </PageTransition>
  );
}

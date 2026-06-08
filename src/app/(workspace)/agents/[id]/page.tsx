"use client";

import { useParams } from "next/navigation";
import { PageTransition } from "@/components/common/PageTransition";
import { AgentsPageClient } from "@/components/pages/agents/agents-page-client";

/** 智能体详情路由 —— 根据 URL 参数自动选中对应智能体 */
export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <PageTransition>
      <AgentsPageClient initialAgentId={id} />
    </PageTransition>
  );
}

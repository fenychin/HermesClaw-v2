"use client";

import { PageTransition } from "@/components/common/PageTransition";
import { RecentPageClient } from "@/components/pages/recent/recent-page-client";

/**
 * 最近页面
 * —— 按时间聚合的最近对话、任务、项目、文件与升级建议，支持筛选与快捷跳转（PRD 10.8）
 */
export default function RecentPage() {
  return (
    <PageTransition>
      <RecentPageClient />
    </PageTransition>
  );
}

"use client";

import { PageTransition } from "@/components/common/PageTransition";
import { ProjectTabs } from "./_components/project-tabs";
import { ProjectRiskPanel } from "./_components/project-risk-panel";

// ============================================================
// 项目空间详情页
// —— 风险点与下一步建议（可折叠面板）
// —— 五标签视图：聊天 / 任务 / 文件 / 动态 / 智能体（PRD §10.5）
// ============================================================

/** mock 风险数据 —— 后续版本接入 AI 分析 */
const MOCK_RISK_POINTS = [
  {
    title: "UL 认证更新进度滞后",
    level: "high" as const,
    detail: "BrightPath 灯具项目 UL 认证仍未完成，可能影响交期。",
  },
  {
    title: "日元汇率波动风险",
    level: "mid" as const,
    detail: "Sakura 项目日元结算，近期波动较大需关注汇率锁定窗口。",
  },
  {
    title: "法国反倾销关税待评估",
    level: "low" as const,
    detail: "Maison Elegance 项目需确认最新反倾销税率。",
  },
];

const MOCK_NEXT_ACTIONS = [
  {
    action: "联系 UL 实验室确认认证进度，同步更新 BrightPath 项目时间线。",
    priority: "urgent" as const,
  },
  {
    action: "监控日元汇率走势，设置止损/止盈提醒，评估远期锁汇方案。",
    priority: "normal" as const,
  },
  {
    action: "整理本月所有项目进展报告，准备周会汇报材料。",
    priority: "later" as const,
  },
];

export default function ProjectDetailPage() {
  return (
    <PageTransition>
      {/* 顶层容器，全屏自适应 */}
      <div className="flex h-[calc(100vh-3rem)] w-full flex-col overflow-hidden bg-background">
        {/* 风险点与下一步建议（可折叠） */}
        <div className="shrink-0 px-4 pt-3 pb-1">
          <ProjectRiskPanel
            riskPoints={MOCK_RISK_POINTS}
            nextActions={MOCK_NEXT_ACTIONS}
          />
        </div>

        {/* 多标签视图主区域 */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ProjectTabs />
        </div>
      </div>
    </PageTransition>
  );
}

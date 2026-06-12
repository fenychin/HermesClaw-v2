"use client";

import Link from "next/link";
import {
  MessageSquare,
  Users,
  ClipboardList,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { PageTransition } from "@/components/common/PageTransition";
import { WorkflowCard } from "./_components/workflow-card";
import { InquiryQuickEntry } from "./_components/inquiry-quick-entry";
import { TRADE_WORKFLOWS } from "./_data/workflows";
import {
  useDashboardStats,
  useQuotations,
  useInquiries,
  computeMonthlyAmount,
  countUrgentInquiries,
} from "@/hooks/use-dashboard-stats";
import { useIntelligence, filterRiskItems } from "@/hooks/use-intelligence";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import {
  useAgents,
  useSkills,
  useConnectors,
  filterByCategory,
} from "@/hooks/use-foreign-trade-resources";
import {
  AgentSection,
  SkillSection,
  ConnectorSection,
} from "./_components/trade-resource-cards";
import type { MarketIntelligence } from "@/types/trade";
import type { ExchangeRateItem } from "@/hooks/use-exchange-rates";
import { cn } from "@/lib/utils";

// ============================================================
// 子组件：汇率卡片（接入 /api/exchange-rates 真实数据）
// ============================================================
function ExchangeRateCard({
  rates,
  isLoading,
}: {
  rates: ExchangeRateItem[];
  isLoading: boolean;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      {/* 卡片标题 */}
      <p className="text-muted-foreground mb-3 text-xs font-medium">汇率监测</p>
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-5 bg-accent/40 rounded animate-pulse" />
          ))}
        </div>
      ) : rates.length === 0 ? (
        <p className="text-hint text-xs">暂无汇率数据</p>
      ) : (
        <div className="space-y-3">
          {rates.map((rate) => {
            const isUp = rate.change24h >= 0;
            return (
              <div key={rate.pair} className="flex items-center justify-between">
                {/* 货币对 */}
                <span className="text-foreground text-sm font-medium">{rate.pair}</span>
                <div className="flex items-center gap-2">
                  {/* 汇率值 */}
                  <span className="text-foreground text-sm font-semibold tabular-nums">
                    {rate.value.toFixed(4)}
                  </span>
                  {/* 24h 变化 */}
                  <div
                    className={cn(
                      "flex items-center gap-0.5 text-xs font-medium",
                      isUp ? "text-success" : "text-danger",
                    )}
                  >
                    {isUp ? (
                      <TrendingUp className="size-3" />
                    ) : (
                      <TrendingDown className="size-3" />
                    )}
                    <span>{isUp ? "+" : ""}{rate.change24h.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 子组件：单条风险提醒（来自 MarketIntelligence 真实数据）
// ============================================================
function RiskItemCard({ item }: { item: MarketIntelligence }) {
  return (
    <div className="bg-destructive/10 rounded-xl p-3 mb-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="text-danger mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-danger text-sm font-medium leading-snug">{item.title}</p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed line-clamp-3">
            {item.summary}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 子组件：AI 晨报入口
// ============================================================
function AIMorningReportCard() {
  return (
    <Link
      href="/dashboard"
      className={cn(
        "bg-primary/10 rounded-2xl p-4 flex items-center justify-between",
        "hover:bg-primary/15 transition-colors duration-150 cursor-pointer",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="bg-primary/20 rounded-xl p-2">
          <Sparkles className="text-primary size-4" />
        </div>
        <div>
          <p className="text-foreground text-sm font-medium">查看今日 AI 晨报</p>
          <p className="text-muted-foreground text-xs mt-0.5">智能摘要 · 已更新</p>
        </div>
      </div>
      <ChevronRight className="text-primary size-4 shrink-0" />
    </Link>
  );
}

// ============================================================
// 页面主体
// ============================================================
export default function ForeignTradePage() {
  // 大盘统计数据（TanStack Query，staleTime: 30s）
  const { stats, isLoading: statsLoading } = useDashboardStats();
  // 报价数据（用于计算本月成交金额）
  const { quotations, isLoading: quotationsLoading } = useQuotations();
  // 询盘数据（用于统计紧急任务数）
  const { inquiries } = useInquiries();
  // 市场情报（行业动态 / 风险提醒，真实 DB 数据）
  const { items: intelligence, isLoading: intelLoading } = useIntelligence();
  // 汇率监测（真实数据源）
  const { items: rates, isLoading: ratesLoading } = useExchangeRates();
  // 外贸智能体 / 知识模板 / 连接器
  const { items: agents, isLoading: agentsLoading } = useAgents();
  const { items: skills, isLoading: skillsLoading } = useSkills();
  const { items: connectors, isLoading: connectorsLoading } = useConnectors();

  // 按外贸行业筛选
  const tradeAgents = filterByCategory(agents, "trade");
  const tradeSkills = filterByCategory(skills, "foreign-trade");
  const tradeConnectors = filterByCategory(connectors, "trade");

  // 从情报中筛选风险提醒（关税 / 物流 / 竞品 且影响非低）
  const riskItems = filterRiskItems(intelligence).slice(0, 3);

  const isLoading = statsLoading || quotationsLoading;

  // 从真实数据计算指标
  const todayInquiries = stats?.todayInquiries ?? 0;
  const todayInquiriesChange = stats?.todayInquiriesChange ?? 0;
  const followingCustomers = stats?.followingCustomers ?? 0;
  const pendingTasks = stats?.pendingTasks ?? 0;
  const urgentTasks = countUrgentInquiries(inquiries);
  const monthlyAmount = computeMonthlyAmount(quotations);

  return (
    <PageTransition>
      {/* 外层容器：左主区 + 右侧面板 */}
      <div className="flex flex-col lg:flex-row h-full min-h-0 p-6 gap-6 overflow-y-auto lg:overflow-hidden">
        {/* ================================================ */}
        {/* 左主区                                          */}
        {/* ================================================ */}
        <div className="flex-1 min-w-0 lg:overflow-y-auto space-y-6">
          {/* 页头：外贸工作台 */}
          <PageHeader
            title="外贸工作台"
            description="今日经营概览"
          />

          {/* ---- 经营概览 StatCard 4列网格（接入真实聚合数据） ---- */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {/* 今日询盘 */}
            <StatCard
              title="今日询盘"
              value={todayInquiries}
              icon={MessageSquare}
              change={{ value: todayInquiriesChange, label: "较昨日" }}
              isLoading={isLoading}
            />

            {/* 跟进中客户 */}
            <StatCard
              title="跟进中客户"
              value={followingCustomers}
              icon={Users}
              description={pendingTasks > 0 ? `待回复 ${pendingTasks} 条` : "全部已回复"}
              isLoading={isLoading}
            />

            {/* 待处理任务 */}
            <StatCard
              title="待处理任务"
              value={pendingTasks}
              icon={ClipboardList}
              description={urgentTasks > 0 ? `紧急 ${urgentTasks} 项` : "无紧急任务"}
              isLoading={isLoading}
            />

            {/* 本月成交金额 */}
            <StatCard
              title="本月成交金额"
              value={monthlyAmount > 0 ? `$${(monthlyAmount / 1000).toFixed(1)}k` : "$0"}
              icon={DollarSign}
              isLoading={isLoading}
            />
          </div>

          {/* ---- 询盘快速入口 ---- */}
          <InquiryQuickEntry />

          {/* ---- 常用工作流 ---- */}
          <section className="mt-6">
            <p className="text-foreground font-medium mb-4">常用工作流</p>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {TRADE_WORKFLOWS.map((wf) => (
                <WorkflowCard key={wf.id} workflow={wf} />
              ))}
            </div>
          </section>

          {/* ---- 外贸专属智能体推荐 ---- */}
          <div className="mt-6">
            <AgentSection agents={tradeAgents} isLoading={agentsLoading} />
          </div>

          {/* ---- 外贸知识模板 ---- */}
          <div className="mt-6">
            <SkillSection skills={tradeSkills} isLoading={skillsLoading} />
          </div>

          {/* ---- 连接器推荐 ---- */}
          <div className="mt-6">
            <ConnectorSection connectors={tradeConnectors} isLoading={connectorsLoading} />
          </div>
        </div>

        {/* ================================================ */}
        {/* 右侧面板（w-72 shrink-0）                       */}
        {/* ================================================ */}
        <aside
          className={cn(
            "w-full lg:w-72 shrink-0 lg:border-l border-border",
            "lg:overflow-y-auto lg:pl-6",
          )}
        >
          {/* 面板标题行 */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-foreground font-medium text-sm">行业动态</h2>
            <Link
              href="/dashboard"
              className="text-primary text-xs hover:text-primary/80 transition-colors"
            >
              更多
            </Link>
          </div>

          {/* 汇率监测卡片 */}
          <ExchangeRateCard rates={rates} isLoading={ratesLoading} />

          {/* 风险提醒列表 */}
          <div className="mt-4">
            <p className="text-muted-foreground text-xs font-medium mb-2">风险提醒</p>
            {intelLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 bg-accent/40 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : riskItems.length === 0 ? (
              <p className="text-hint text-xs px-1">暂无风险提醒</p>
            ) : (
              riskItems.map((item) => <RiskItemCard key={item.id} item={item} />)
            )}
          </div>

          {/* AI 晨报入口卡片 */}
          <div className="mt-4">
            <AIMorningReportCard />
          </div>
        </aside>
      </div>
    </PageTransition>
  );
}

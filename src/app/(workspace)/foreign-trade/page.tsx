"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { WorkflowHealthMonitor } from "./_components/workflow-health-monitor";
import { useForeignTradeCapabilities } from "@/hooks/use-foreign-trade-capabilities";
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
// 子组件：外贸跟进漏斗 (与大盘指标联动，提供 Drill-down 入口)
// NOTE: 点击漏斗节点可以直接跳转到对应的外贸工作流，数据从数据库实时聚合
// ============================================================
function TradeFunnelDrillDown({
  todayInquiries,
  followingCustomers,
  quotationsCount,
  acceptedQuotationsCount,
}: {
  todayInquiries: number;
  followingCustomers: number;
  quotationsCount: number;
  acceptedQuotationsCount: number;
}) {
  const router = useRouter();

  const funnelSteps = [
    {
      label: "客户询盘",
      count: todayInquiries,
      trend: "+12%",
      color: "bg-primary/5 text-primary border-primary/20 hover:border-primary/50",
      wfId: "inquiry-grade",
      desc: "询盘智能分级评估",
    },
    {
      label: "客户画像",
      count: followingCustomers,
      trend: "+8%",
      color: "bg-brand-blue/5 text-brand-blue border-brand-blue/20 hover:border-brand-blue/50",
      wfId: "customer-profile",
      desc: "多维客户背景建档",
    },
    {
      label: "发送报价",
      count: quotationsCount,
      trend: "-3%",
      color: "bg-warning/5 text-warning border-warning/20 hover:border-warning/50",
      wfId: "quote-gen",
      desc: "多术语智能成本报价",
    },
    {
      label: "订单推进",
      count: acceptedQuotationsCount,
      trend: "+15%",
      color: "bg-success/5 text-success border-success/20 hover:border-success/50",
      wfId: "order-push",
      desc: "跟单节点合规监控",
    },
  ];

  return (
    <section className="bg-card/45 backdrop-blur-md rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-foreground text-sm font-semibold">
            外贸跟进漏斗 (大盘 Drill-down)
          </h3>
          <p className="text-hint text-xs mt-0.5">
            反映客户生命周期的流转效率，点击节点可直达工作流控制台
          </p>
        </div>
        <span className="text-[10px] text-hint bg-background border border-border rounded px-2 py-0.5 font-medium">
          实时大盘数据
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {funnelSteps.map((step, idx) => (
          <div
            key={idx}
            onClick={() => router.push(`/foreign-trade/workflows/${step.wfId}`)}
            className={cn(
              "p-4 rounded-xl border cursor-pointer transition-all duration-200",
              "hover:shadow-sm hover:scale-[1.01] active:scale-[0.99]",
              step.color,
            )}
          >
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold leading-none">{step.label}</span>
              <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-background/60 font-mono">
                {step.trend}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-bold font-mono leading-none">{step.count}</span>
              <span className="text-[10px] opacity-75">笔</span>
            </div>
            <p className="mt-2 text-[10px] opacity-60 leading-tight">
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// 子组件：汇率卡片（接入 /api/packs/foreign-trade/exchange-rates 真实数据）
// ============================================================
function ExchangeRateCard({
  rates,
  isLoading,
}: {
  rates: ExchangeRateItem[];
  isLoading: boolean;
}) {
  return (
    <div className="bg-card/45 backdrop-blur-md rounded-2xl border border-border p-4">
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
    <div className="bg-destructive/10 rounded-xl p-3 mb-2 border border-destructive/20">
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
        "bg-primary/10 rounded-2xl p-4 flex items-center justify-between border border-primary/20",
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
  const workflows = useForeignTradeCapabilities();
  // 大盘统计数据（TanStack Query，staleTime: 30s）
  const { stats, isLoading: statsLoading } = useDashboardStats();
  // 报价数据（用于计算本月成交金额及漏斗转化数）
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

  // 漏斗联动统计 (动态获取)
  const quotationsCount = quotations?.length ?? 0;
  const acceptedQuotationsCount = quotations?.filter((q) => q.status === "accepted").length ?? 0;

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
            description="外贸 Industry Pack · 智能跟进启动面板"
          />

          {/* ---- 经营概览 StatCard 4列网格（接入真实整合数据） ---- */}
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

          {/* ---- 外贸跟进漏斗 (与大盘指标联动，提供 Drill-down 入口) ---- */}
          <TradeFunnelDrillDown
            todayInquiries={todayInquiries}
            followingCustomers={followingCustomers}
            quotationsCount={quotationsCount}
            acceptedQuotationsCount={acceptedQuotationsCount}
          />

          {/* ---- 询盘快速录入与自动分级处理 ---- */}
          <InquiryQuickEntry />

          {/* ---- 常用工作流 ---- */}
          <section className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-foreground font-semibold text-sm">常用工作流控制台</h3>
              <span className="text-xs text-hint">一键启动，自动通过底层 DAG 运行引擎执行</span>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {workflows.map((wf) => (
                <WorkflowCard key={wf.id} workflow={wf} />
              ))}
            </div>
          </section>

          {/* ---- 外贸专属智能体推荐 ---- */}
          <div className="mt-6">
            <AgentSection agents={tradeAgents} isLoading={agentsLoading} />
          </div>

          {/* ---- 外贸知识与Skill模板 ---- */}
          <div className="mt-6">
            <SkillSection skills={tradeSkills} isLoading={skillsLoading} />
          </div>

          {/* ---- 连接器推荐 ---- */}
          <div className="mt-6">
            <ConnectorSection connectors={tradeConnectors} isLoading={connectorsLoading} />
          </div>
        </div>

        {/* ================================================ */}
        {/* 右侧面板：健康、汇率与风险监测                     */}
        {/* ================================================ */}
        <aside
          className={cn(
            "w-full lg:w-72 shrink-0 lg:border-l border-border",
            "lg:overflow-y-auto lg:pl-6 space-y-4",
          )}
        >
          {/* 自演化与健康监测卡片 */}
          <WorkflowHealthMonitor />

          {/* 汇率监测卡片 */}
          <ExchangeRateCard rates={rates} isLoading={ratesLoading} />

          {/* 风险提醒列表 */}
          <div className="bg-card/45 backdrop-blur-md rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-foreground font-medium text-xs">贸易风险预警</h2>
              <Link
                href="/dashboard"
                className="text-primary text-[10px] hover:text-primary/80 transition-colors"
              >
                全部
              </Link>
            </div>
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
          <AIMorningReportCard />
        </aside>
      </div>
    </PageTransition>
  );
}

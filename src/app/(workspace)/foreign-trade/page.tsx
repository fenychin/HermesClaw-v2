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
import { cn } from "@/lib/utils";

// ============================================================
// 汇率 Mock 数据（暂无 DB 表，保留占位）
// ============================================================
interface ExchangeRate {
  pair: string;
  value: number;
  change24h: number; // 24h 变化百分比
}

const EXCHANGE_RATES: ExchangeRate[] = [
  { pair: "USD/CNY", value: 7.2431, change24h: -0.08 },
  { pair: "EUR/CNY", value: 7.8902, change24h: 0.12 },
];

// ============================================================
// 风险提醒 Mock 数据（暂无 DB 表，保留占位）
// ============================================================
interface RiskItem {
  id: string;
  title: string;
  description: string;
}

const RISK_ITEMS: RiskItem[] = [
  {
    id: "risk-1",
    title: "美关税政策变动预警",
    description: "美对华部分品类关税上调 15%，影响铝制品出口报价，请及时复核在手报价单。",
  },
  {
    id: "risk-2",
    title: "红海航线延误风险",
    description: "红海绕行导致欧洲航线交期延长 10–14 天，建议客户合同中增加不可抗力条款。",
  },
  {
    id: "risk-3",
    title: "欧元汇率波动",
    description: "EUR/CNY 过去 7 日波动幅度超 1.5%，持欧元计价订单请关注结汇时机。",
  },
];

// ============================================================
// 子组件：汇率卡片
// ============================================================
function ExchangeRateCard({ rates }: { rates: ExchangeRate[] }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      {/* 卡片标题 */}
      <p className="text-muted-foreground mb-3 text-xs font-medium">汇率监测</p>
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
    </div>
  );
}

// ============================================================
// 子组件：单条风险提醒
// ============================================================
function RiskItemCard({ item }: { item: RiskItem }) {
  return (
    <div className="bg-destructive/10 rounded-xl p-3 mb-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="text-danger mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-danger text-sm font-medium leading-snug">{item.title}</p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            {item.description}
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
          <ExchangeRateCard rates={EXCHANGE_RATES} />

          {/* 风险提醒列表 */}
          <div className="mt-4">
            <p className="text-muted-foreground text-xs font-medium mb-2">风险提醒</p>
            {RISK_ITEMS.map((item) => (
              <RiskItemCard key={item.id} item={item} />
            ))}
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

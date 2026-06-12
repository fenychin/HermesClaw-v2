"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  MessageSquare,
  Users,
  ClipboardList,
  Target,
  ExternalLink,
  Activity,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  AlertTriangle,
  Sun,
  Moon,
  BarChart3,
  Loader2,
  Radio,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PageTransition } from "@/components/common/PageTransition";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import {
  useDashboardStats,
  useInquiries,
} from "@/hooks/use-dashboard-stats";
import { useActivityFeed } from "@/hooks/use-activity-feed";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useSilenceAlerts } from "@/hooks/use-silence-alerts";
import { useCreateTask } from "@/hooks/use-tasks";
import { useReports, useGenerateReport } from "@/hooks/use-reports";
import { useDashboardStream } from "@/hooks/use-dashboard-stream";
import type { ReportType } from "@/types/dashboard";
import { useCurrentWorkspaceRole } from "@/hooks/use-workspace-role";
import { toast } from "sonner";
import { mapImpactToSeverity, mapRiskToSeverity } from "@/types/dashboard";
import type { ImpactLevel, MarketIntelligence } from "@/types/trade";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonList } from "@/components/common/skeleton-list";
import { RelativeTime } from "@/components/common/relative-time";
import { cn } from "@/lib/utils";

/**
 * 懒加载柱状图（recharts 体积大且仅客户端渲染）
 * —— ssr:false：跳过服务端渲染，recharts 单独成块、按需编译，加快大盘路由首屏
 */
const WorkflowBarChart = dynamic(
  () => import("./_components/workflow-bar-chart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[200px] mt-4 flex items-center justify-center text-hint text-xs bg-accent/5 rounded-xl border border-border/30">
        图表加载中...
      </div>
    ),
  },
);

/** 懒加载询盘趋势折线图（recharts 体积大，ssr:false 减负） */
const InquiryTrendChart = dynamic(
  () => import("./_components/inquiry-trend-chart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[180px] mt-2 flex items-center justify-center text-hint text-xs bg-accent/5 rounded-xl border border-border/30">
        图表加载中...
      </div>
    ),
  },
);

/** 懒加载世界贸易热力图（SSR: false） */
const WorldTradeHeatmap = dynamic(
  () => import("./_components/world-trade-heatmap"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[320px] flex items-center justify-center text-hint text-xs bg-accent/5 rounded-xl border border-border/30">
        热力图加载中...
      </div>
    ),
  },
);

/** 懒加载风险雷达图（Recharts RadarChart） */
const RiskRadarChart = dynamic(
  () => import("./_components/risk-radar-chart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[280px] flex items-center justify-center text-hint text-xs bg-accent/5 rounded-xl border border-border/30">
        雷达图加载中...
      </div>
    ),
  },
);

import { InquiryRadar } from "./_components/inquiry-radar";
import { DashboardFilterBar } from "./_components/dashboard-filter-bar";
import { CreateTaskDialog } from "./_components/create-task-dialog";
import { ActiveClientSection } from "./_components/active-client-alerts";
import AlertTicker from "./_components/alert-ticker";
import { SentimentRow } from "./_components/sentiment-gauge";
import KpiComparisonBar from "./_components/kpi-comparison-bar";
import PredictivePanel from "./_components/predictive-panel";


// ============================================================
// 仪表板加载骨架
// ============================================================

function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="动态大盘" description="外贸动态经营与数据概览" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-5 h-[104px] animate-pulse" />
        ))}
      </div>
      <div className="bg-card rounded-2xl border border-border p-4 h-12 animate-pulse" />
      <div className="h-96 flex items-center justify-center text-hint text-sm">加载中...</div>
    </div>
  )
}

// ============================================================
// 页面组件（入口）
// ============================================================

export default function DashboardPage() {
  return (
    <PageTransition>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </PageTransition>
  )
}

// ============================================================
// 仪表板内容（useSearchParams 需 Suspense 边界）
// ============================================================

function DashboardContent() {
  // —— URL 筛选参数（驱动服务端过滤） ——
  const searchParams = useSearchParams()
  const fromCountry = searchParams.get("country") ?? undefined
  const stage = searchParams.get("stage") ?? undefined

  // 大盘统计数据（TanStack Query，staleTime: 30s）
  const { stats, isLoading } = useDashboardStats();
  const urgentCount = stats?.urgentCount ?? 0;

  // 合并活动流（情报 + 智能体，上限 20 条）
  const { feed: activities, isLoading: feedLoading } = useActivityFeed(20);

  // 询盘雷达（支持 fromCountry / stage 服务端筛选，前 50 条）
  const { inquiries, isLoading: radarLoading } = useInquiries({
    limit: 50,
    fromCountry,
    stage,
  });

  // 汇率监测（真实数据源，取前 3 组货币对）
  const { items: rates, isLoading: ratesLoading } = useExchangeRates();
  const topRates = rates.slice(0, 3);

  // 分发为任务对话框
  const [dialogIntel, setDialogIntel] = useState<MarketIntelligence | null>(null);

  // 报告（支持晨报/晚报/周报切换）
  const [reportType, setReportType] = useState<ReportType>("MORNING");
  const reportLabel =
    reportType === "MORNING" ? "晨报" : reportType === "EVENING" ? "晚报" : "周报";
  const ReportIcon =
    reportType === "MORNING" ? Sun : reportType === "EVENING" ? Moon : BarChart3;
  const reportIconClass =
    reportType === "MORNING"
      ? "text-warning"
      : reportType === "EVENING"
        ? "text-brand-blue"
        : "text-success";
  const { latest: currentReport, isLoading: briefLoading } = useReports(reportType, 1);
  const generateReport = useGenerateReport();
  const [briefExpanded, setBriefExpanded] = useState(false);
  const { canWrite: canGenerate } = useCurrentWorkspaceRole();

  // 沉默预警（超 7 天未回复询盘）
  const { alerts: silenceAlerts, hasAlerts, isLoading: silenceLoading } = useSilenceAlerts();
  const createTask = useCreateTask();

  // 大盘实时流（SSE 自动刷新 + polling 降级）
  const { connected } = useDashboardStream();

  /** 从沉默预警快速创建跟进任务 */
  const handleSilenceTask = (alert: (typeof silenceAlerts)[number]) => {
    const threeDaysLater = new Date()
    threeDaysLater.setDate(threeDaysLater.getDate() + 3)
    const dueAt = threeDaysLater.toISOString().slice(0, 10)

    createTask.mutate(
      {
        title: `跟进沉默客户: ${alert.countryFlag} ${alert.country}（${alert.count} 条未回复）`,
        description: `该地区最久未回复已达 ${alert.silenceDays} 天，样本客户: ${alert.sampleCompany}`,
        priority: "HIGH",
        source: "inquiry",
        relatedType: "silence-alert",
        dueAt,
      },
      {
        onSuccess: () => {
          toast.success("跟进任务已创建", {
            description: `已为 ${alert.country} 沉默客户创建跟进任务`,
          })
        },
        onError: (error) => {
          toast.error("任务创建失败", {
            description: error instanceof Error ? error.message : "未知错误",
          })
        },
      },
    )
  }

  // 从 FeedItem 推导严重程度（复用共享映射函数）
  const getSeverity = (item: typeof activities[number]) =>
    item.type === "intelligence"
      ? mapImpactToSeverity((item.meta.impactLevel ?? "low") as ImpactLevel)
      : mapRiskToSeverity(item.meta.riskLevel as string | null);

  // 根据真实数据构建图表数据，fallback 为空数组
  const chartData = stats?.weeklyWorkflowRuns?.map((d) => ({
    name: d.day,
    成功: d.success,
    失败: d.failed,
  })) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <PageHeader
            title="动态大盘"
            description="外贸动态经营与数据概览"
          />
        </div>
        {/* 实时连接指示器 */}
        <div className="flex items-center gap-2 pr-2 -mt-4">
          <Radio
            className={cn(
              "size-3",
              connected ? "text-success animate-pulse" : "text-hint",
            )}
          />
          <span className="text-xs text-muted-foreground">
            {connected ? "实时" : "轮询"}
          </span>
        </div>
      </div>

      {/* AI 报告 — 晨报/晚报/周报（顶部通栏卡片，支持类型切换） */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-foreground font-semibold text-base flex items-center gap-2">
            <ReportIcon className={cn("size-5", reportIconClass)} />
            {reportType === "MORNING"
              ? "今日晨报"
              : reportType === "EVENING"
                ? "今日晚报"
                : "本周周报"}
            {currentReport && (
              <span className="text-hint text-xs font-normal ml-1">
                {new Date(currentReport.generatedAt).toLocaleTimeString(
                  "zh-CN",
                  { hour: "2-digit", minute: "2-digit" },
                )}
              </span>
            )}
          </h3>

          {/* 报告类型切换 Tab */}
          <div className="flex items-center gap-1 bg-accent/50 rounded-lg p-0.5">
            {(
              [
                ["MORNING", "晨报"] as const,
                ["EVENING", "晚报"] as const,
                ["WEEKLY", "周报"] as const,
              ]
            ).map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setReportType(type)
                  setBriefExpanded(false)
                }}
                className={cn(
                  "text-xs font-medium px-2.5 py-1 rounded-md transition-colors",
                  reportType === type
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {briefLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : currentReport ? (
          <div>
            <div className="text-foreground text-sm leading-relaxed whitespace-pre-line">
              {briefExpanded
                ? currentReport.content
                : currentReport.content.length > 150
                  ? currentReport.content.slice(0, 150) + "..."
                  : currentReport.content}
            </div>
            {currentReport.content.length > 150 && (
              <button
                type="button"
                onClick={() => setBriefExpanded(!briefExpanded)}
                className="text-brand-blue hover:underline text-xs mt-2"
              >
                {briefExpanded ? "收起" : "展开全文"}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-hint text-sm">
              {reportType === "MORNING"
                ? "暂无今日晨报，AI 将汇总市场动态、询盘概况与待办提醒"
                : reportType === "EVENING"
                  ? "暂无今日晚报，AI 将汇总当日成果与次日展望"
                  : "暂无本周周报，AI 将汇总本周趋势与下周待办"}
            </p>
            <button
              type="button"
              onClick={() =>
                generateReport.mutate(reportType, {
                  onError: (error) => {
                    toast.error(`生成${reportLabel}失败`, {
                      description:
                        error instanceof Error ? error.message : "未知错误",
                    })
                  },
                })
              }
              disabled={generateReport.isPending || !canGenerate}
              title={!canGenerate ? "需要成员权限" : undefined}
              className="bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generateReport.isPending ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <ReportIcon className="size-3" />
                  生成{reportLabel}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* —— 📊 顶部指标行 —— */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="今日询盘数"
          value={stats?.todayInquiries ?? 0}
          change={{
            value: stats?.todayInquiriesChange ?? 0,
            label: "较昨日",
          }}
          icon={MessageSquare}
          isLoading={isLoading}
          sparklineData={stats?.sparklines?.todayInquiries}
          trend={stats?.trends?.todayInquiries}
          drillDownHref="/foreign-trade?tab=inquiries"
        />
        <StatCard
          title="跟进客户数"
          value={stats?.followingCustomers ?? 0}
          icon={Users}
          isLoading={isLoading}
          trend={stats?.trends?.followingCustomers}
        />
        {/* 待办任务（含紧急提示） */}
        <div className="relative bg-card rounded-2xl border border-border p-5 flex flex-col justify-between">
          {isLoading ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="h-4 w-16 bg-accent rounded animate-pulse" />
                <div className="size-10 bg-accent rounded-xl animate-pulse shrink-0" />
              </div>
              <div className="mt-2 space-y-2">
                <div className="h-8 w-12 bg-accent rounded-lg animate-pulse" />
                <div className="h-4 w-24 bg-accent rounded animate-pulse" />
              </div>
            </>
          ) : (
            <>
              {urgentCount > 0 && (
                <div
                  className="absolute top-3 right-3 size-2 rounded-full bg-warning"
                  title={`${urgentCount} 项紧急待办`}
                />
              )}
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground text-sm font-medium">
                  待办任务
                </span>
                <div className="bg-primary/10 text-primary rounded-xl p-2 shrink-0">
                  <ClipboardList className="size-5" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-foreground text-2xl font-semibold tracking-tight">
                  {(stats?.pendingTasks ?? 0).toLocaleString()}
                </div>
                {urgentCount > 0 ? (
                  <p className="text-warning text-xs mt-1">
                    其中紧急 {urgentCount} 项
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs mt-1">
                    暂无紧急待办
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <StatCard
          title="活跃项目"
          value={stats?.activeProjects ?? 0}
          icon={Target}
          isLoading={isLoading}
          trend={stats?.trends?.activeProjects}
          drillDownHref="/projects"
        />
      </div>

      {/* —— 🔍 筛选栏 —— */}
      <DashboardFilterBar />

      {/* —— 💱 汇率监测 + 预测指示器 —— */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-foreground font-semibold text-sm">汇率监测</h3>
            <Link
              href="/foreign-trade"
              className="text-brand-blue hover:underline text-xs flex items-center gap-1"
            >
              查看详情
              <ChevronRight className="size-3" />
            </Link>
          </div>

          <div className="space-y-2">
            {ratesLoading ? (
              <SkeletonList count={3}>
                {(i) => (
                  <div
                    key={`rate-skel-${i}`}
                    className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                  >
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-14" />
                  </div>
                )}
              </SkeletonList>
            ) : topRates.length > 0 ? (
              topRates.map((rate) => {
                const isUp = rate.change24h >= 0
                return (
                  <div
                    key={rate.id}
                    className="flex items-center justify-between py-2 first:pt-0 last:pb-0 border-b border-border/40 last:border-b-0"
                  >
                    <span className="text-foreground text-sm font-medium tabular-nums min-w-[64px]">
                      {rate.pair}
                    </span>
                    <span className="text-foreground text-sm tabular-nums font-medium flex-1 text-center">
                      {rate.value.toFixed(4)}
                    </span>
                    <span
                      className={cn(
                        "text-xs tabular-nums flex items-center gap-1 min-w-[72px] justify-end",
                        isUp ? "text-success" : "text-danger",
                      )}
                    >
                      {isUp ? (
                        <TrendingUp className="size-3" />
                      ) : (
                        <TrendingDown className="size-3" />
                      )}
                      {isUp ? "+" : ""}
                      {rate.change24h.toFixed(4)}
                    </span>
                  </div>
                )
              })
            ) : (
              <p className="text-hint text-xs text-center py-4">暂无汇率数据</p>
            )}
          </div>
        </div>

        {/* 预测指示器卡片 */}
        <PredictivePanel data={stats?.predictiveIndicators ?? []} />
      </div>

      {/* —— 📊 KPI 对比条 —— */}
      <KpiComparisonBar
        data={
          stats?.comparisons
            ? [stats.comparisons.inquiryVolume, stats.comparisons.responseRate]
            : []
        }
      />

      {/* —— 🚨 告警滚动条 —— */}
      <AlertTicker
        alerts={activities.filter(
          (a) =>
            a.type === "intelligence" &&
            (a.meta.impactLevel === "high" || a.meta.impactLevel === "mid"),
        )}
        silenceCount={silenceAlerts.length}
        urgentCount={urgentCount}
      />

      {/* —— 🌍 + 🎯 热力图 & 风险雷达 —— */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <WorldTradeHeatmap
            data={stats?.geoDistribution ?? []}
            minHeight={340}
          />
        </div>
        <div className="lg:col-span-1">
          <RiskRadarChart
            data={stats?.riskRadar ?? []}
            className="h-full"
          />
        </div>
      </div>

      {/* —— 询盘雷达 + 趋势折线图 —— */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <InquiryRadar inquiries={inquiries} isLoading={radarLoading} />
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="text-foreground font-semibold text-base mb-2">
            询盘趋势
          </h3>
          {isLoading ? (
            <Skeleton className="h-[180px] w-full rounded-xl mt-2" />
          ) : (
            <InquiryTrendChart
              data={stats?.dailyInquiryTrend ?? []}
            />
          )}
        </div>
      </div>

      {/* —— 外交动态流 + 工作流执行概览 —— */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* 外贸动态流（含沉默预警 + 情报快讯） */}
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col justify-between min-h-[300px]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-foreground font-semibold text-base">外贸动态流</h3>
              <Link href="/foreign-trade" className="text-brand-blue hover:underline text-xs flex items-center gap-1">
                查看全部
                <ExternalLink className="size-3" />
              </Link>
            </div>

            {/* 沉默预警 — 超 7 天未回复客户（最多 3 条） */}
            {silenceLoading ? (
              <div className="mb-3 space-y-1.5">
                <Skeleton className="h-8 w-full rounded-lg" />
                <Skeleton className="h-8 w-full rounded-lg" />
              </div>
            ) : hasAlerts ? (
              <div className="mb-3 space-y-1.5">
                {silenceAlerts.slice(0, 3).map((alert) => (
                  <div
                    key={alert.country}
                    className="flex items-center justify-between gap-2 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="size-4 text-warning shrink-0" />
                      <span className="text-foreground text-xs font-medium truncate">
                        <span className="mr-1">{alert.countryFlag}</span>
                        {alert.country}
                      </span>
                      <span className="text-warning text-xs shrink-0">
                        · 沉默 {alert.silenceDays} 天 · {alert.count} 条未回复
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSilenceTask(alert)}
                      disabled={createTask.isPending}
                      className="text-brand hover:text-brand/80 text-xs font-medium shrink-0 transition-colors disabled:opacity-50"
                    >
                      {createTask.isPending ? "创建中..." : "处理"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-success text-xs flex items-center gap-1.5 mb-3">
                <span className="inline-block size-1.5 rounded-full bg-success" />
                所有客户均有及时跟进
              </p>
            )}

            {/* 活动流 + 情报快讯（合并） */}
            <div className="divide-y divide-border/50">
              {feedLoading ? (
                <SkeletonList count={5}>
                  {(i) => (
                    <div key={`skel-${i}`} className="py-3 first:pt-0 last:pb-0 flex items-start gap-4">
                      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-5 w-10 rounded-full" />
                        </div>
                        <Skeleton className="h-4 w-full" />
                      </div>
                    </div>
                  )}
                </SkeletonList>
              ) : activities.length > 0 ? (
                activities.map((item) => {
                  const severity = getSeverity(item)
                  return (
                    <div key={item.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-4">
                      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <RelativeTime
                            value={item.timestamp}
                            className="text-hint text-xs"
                          />
                          <span
                            className={cn(
                              "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                              severity === "urgent" && "bg-danger/10 text-danger border-danger/20",
                              severity === "important" && "bg-warning/10 text-warning border-warning/20",
                              severity === "normal" && "bg-success/10 text-success border-success/20",
                            )}
                          >
                            {severity === "urgent" && "紧急"}
                            {severity === "important" && "重要"}
                            {severity === "normal" && "普通"}
                          </span>
                        </div>
                        <p className="text-foreground text-sm leading-relaxed">
                          {item.type === "agent" ? (
                            <>智能体「{item.title}」: {item.summary}</>
                          ) : (
                            item.title
                          )}
                        </p>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
                  <Activity className="size-8 text-hint" />
                  <p className="text-hint text-sm">暂无动态数据</p>
                  <p className="text-hint text-xs">当有市场情报或智能体执行记录时，将自动在此展示。</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 本周工作流执行概览（接入真实聚合数据） */}
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col justify-between min-h-[300px]">
          <div>
            <h3 className="text-foreground font-semibold text-base mb-4">本周工作流执行概览</h3>
            {chartData.length > 0 ? (
              <WorkflowBarChart data={chartData} />
            ) : (
              <div className="h-[200px] mt-4 flex items-center justify-center text-hint text-xs bg-accent/5 rounded-xl border border-border/30">
                {isLoading ? "数据加载中..." : "本周暂无工作流执行数据"}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* —— 行业情绪仪表盘 —— */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-foreground font-semibold text-sm">行业情绪监测</h3>
          <span className="text-hint text-[10px]">基于近 30 天情报 · 实验性指标</span>
        </div>
        <SentimentRow data={stats?.industrySentiments ?? []} />
      </div>

      {/* 客户活跃预警 — 近 7 天高频询盘客户（正向监测） */}
      <ActiveClientSection
        alerts={stats?.activeClientAlerts ?? []}
        isLoading={isLoading}
      />

      {/* 分发为任务对话框 — 仅在选中情报时渲染 */}
      {dialogIntel && (
        <CreateTaskDialog
          key={dialogIntel.id}
          open
          onOpenChange={(open) => {
            if (!open) setDialogIntel(null)
          }}
          intelligence={dialogIntel}
        />
      )}
    </div>
  );
}

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
  Plus,
  AlertTriangle,
  Sun,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PageTransition } from "@/components/common/PageTransition";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { useDashboardStats, useInquiries } from "@/hooks/use-dashboard-stats";
import { useIntelligence } from "@/hooks/use-intelligence";
import { useActivityFeed } from "@/hooks/use-activity-feed";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useSilenceAlerts } from "@/hooks/use-silence-alerts";
import { useCreateTask } from "@/hooks/use-tasks";
import { useReports, useGenerateReport } from "@/hooks/use-reports";
import { useCurrentWorkspaceRole } from "@/hooks/use-workspace-role";
import { toast } from "sonner";
import { mapImpactToSeverity, mapRiskToSeverity } from "@/types/dashboard";
import type { ImpactLevel, MarketIntelligence } from "@/types/trade";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonList } from "@/components/common/skeleton-list";
import { relativeTime } from "@/lib/date-utils";
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

import { InquiryRadar } from "./_components/inquiry-radar";
import { DashboardFilterBar } from "./_components/dashboard-filter-bar";
import { CreateTaskDialog } from "./_components/create-task-dialog";


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
  const impact = searchParams.get("impact") ?? undefined

  // 大盘统计数据（TanStack Query，staleTime: 30s）
  const { stats, isLoading } = useDashboardStats();
  const urgentCount = stats?.urgentCount ?? 0;

  // 市场情报（支持 impactLevel 筛选；UI 的 "medium" 映射到 DB 的 "mid"）
  const impactLevel = impact && impact !== "all"
    ? (impact === "medium" ? "mid" : impact)
    : undefined
  const { items: intelligence, isLoading: intelLoading } = useIntelligence(
    impactLevel ? { impactLevel } : undefined,
  );
  const sortedIntel = [...intelligence]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 8);

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

  // 今日晨报
  const { latest: morningBrief, isLoading: briefLoading } = useReports("MORNING", 1);
  const generateReport = useGenerateReport();
  const [briefExpanded, setBriefExpanded] = useState(false);
  const { canWrite: canGenerate } = useCurrentWorkspaceRole();

  // 沉默预警（超 7 天未回复询盘）
  const { alerts: silenceAlerts, hasAlerts, isLoading: silenceLoading } = useSilenceAlerts();
  const createTask = useCreateTask();

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
      <PageHeader
        title="动态大盘"
        description="外贸动态经营与数据概览"
      />

      {/* 今日晨报 — AI 生成摘要（顶部通栏卡片） */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-foreground font-semibold text-base flex items-center gap-2">
            <Sun className="size-5 text-warning" />
            今日晨报
            {morningBrief && (
              <span className="text-hint text-xs font-normal ml-1">
                {new Date(morningBrief.generatedAt).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={() => generateReport.mutate()}
            disabled={generateReport.isPending || !canGenerate}
            title={
              !canGenerate ? "需要成员权限" : "重新生成晨报"
            }
            className="text-brand hover:text-brand/80 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generateReport.isPending ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <RefreshCw className="size-3" />
                重新生成
              </>
            )}
          </button>
        </div>

        {briefLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : morningBrief ? (
          <div>
            <div className="text-foreground text-sm leading-relaxed whitespace-pre-line">
              {briefExpanded
                ? morningBrief.content
                : morningBrief.content.length > 150
                  ? morningBrief.content.slice(0, 150) + "..."
                  : morningBrief.content}
            </div>
            {morningBrief.content.length > 150 && (
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
              暂无今日晨报，AI 将汇总市场动态、询盘概况与待办提醒
            </p>
            <button
              type="button"
              onClick={() => generateReport.mutate()}
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
                  <Sun className="size-3" />
                  生成今日晨报
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 大左右结构容器 */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* 左主区 */}
        <div className="flex-1 min-w-0 space-y-6 w-full">

          {/* 顶部指标行 - 4列网格：接入真实聚合数据 */}
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
              />
              <StatCard
                title="跟进客户数"
                value={stats?.followingCustomers ?? 0}
                icon={Users}
                isLoading={isLoading}
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
              />
            </div>

            {/* 筛选栏 — URL 驱动的国家 / 阶段 / 影响力筛选 */}
            <DashboardFilterBar />

            {/* 汇率监测 — 紧凑卡片（真实数据源，前 3 组货币对） */}
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

            {/* 主要内容区 - 2个核心卡片 */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

              {/* 卡片1: 外贸动态流（真实合并活动流） */}
              <div className="bg-card rounded-2xl border border-border p-5 flex flex-col justify-between min-h-[300px]">
                <div>
                  <h3 className="text-foreground font-semibold text-base mb-4">外贸动态流</h3>

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
                                <span className="text-hint text-xs">
                                  {relativeTime(item.timestamp)}
                                </span>
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

              {/* 卡片2: 本周工作流执行概览（接入真实聚合数据） */}
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

            {/* 询盘雷达 — 按优先级分组的询盘列表（前10条） */}
            <InquiryRadar inquiries={inquiries} isLoading={radarLoading} />

          </div>

          {/* 右侧面板：情报快讯（真实 DB 数据） */}
          <div className="w-full lg:w-80 shrink-0 bg-card rounded-2xl border border-border p-5 h-fit space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-foreground font-semibold text-base">情报快讯</h3>
              <Link href="/foreign-trade" className="text-brand-blue hover:underline text-xs flex items-center gap-1">
                查看全部
                <ExternalLink className="size-3" />
              </Link>
            </div>

            {/* 情报卡片列表 */}
            <div className="flex flex-col">
              {intelLoading ? (
                <SkeletonList count={5}>
                  {(i) => (
                    <Skeleton key={`skel-${i}`} className="h-[72px] w-full rounded-xl mb-2 last:mb-0" />
                  )}
                </SkeletonList>
              ) : sortedIntel.length > 0 ? (
                sortedIntel.map((item) => (
                  <div
                    key={item.id}
                    className="relative bg-card rounded-xl border border-border p-3 mb-2 last:mb-0 flex flex-col gap-1.5 transition-all hover:bg-hover hover:border-border/80"
                  >
                    {/* 右上角影响力色点 */}
                    <div
                      className={cn(
                        "absolute top-3.5 right-3.5 w-2 h-2 rounded-full",
                        item.impactLevel === "high" && "bg-danger",
                        item.impactLevel === "mid" && "bg-warning",
                        item.impactLevel === "low" && "bg-success",
                      )}
                    />
                    <h4 className="text-foreground text-sm font-medium pr-6 leading-snug">
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-2 text-hint text-xs">
                      <span>{item.source}</span>
                      <span>•</span>
                      <span>{relativeTime(item.publishedAt)}</span>
                    </div>
                    {/* 分发为任务按钮 */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDialogIntel(item)
                      }}
                      className="flex items-center gap-1 text-brand hover:text-brand/80 text-xs font-medium mt-0.5 transition-colors"
                    >
                      <Plus className="size-3" />
                      创建任务
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-hint text-xs text-center py-6">暂无情报数据</p>
              )}
            </div>
          </div>

      </div>

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

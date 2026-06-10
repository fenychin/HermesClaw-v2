"use client";

import { useMounted } from "@/hooks/use-mounted";
import {
  MessageSquare,
  Users,
  ClipboardList,
  Target,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { PageTransition } from "@/components/common/PageTransition";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { cn } from "@/lib/utils";

// ============================================================
// Mock 数据（活动流 & 情报快讯暂无对应 DB 表，保留占位）
// ============================================================

// 外贸动态流数据
interface ActivityItem {
  id: string;
  time: string;
  content: string;
  severity: "normal" | "important" | "urgent";
}

const mockActivities: ActivityItem[] = [
  {
    id: "act-1",
    time: "10分钟前",
    content: `智能客服已自动响应来自 BrightPath Outdoors 关于"LED 户外灯具"的新询盘并推送至跟进流程。`,
    severity: "important",
  },
  {
    id: "act-2",
    time: "1小时前",
    content: "海关数据显示欧盟启动对部分中国 LED 灯具产品的反补贴调查，请相关项目注意规避风险。",
    severity: "urgent",
  },
  {
    id: "act-3",
    time: "3小时前",
    content: "外汇监测到美元兑人民币汇率升至 7.25，建议财务主管加速现有欧洲订单的结汇流程。",
    severity: "normal",
  },
  {
    id: "act-4",
    time: "5小时前",
    content: "智能体自动分析了 Schmidt 的竞品调价动态，并生成了最新对比报告，已同步至大脑知识库。",
    severity: "normal",
  },
  {
    id: "act-5",
    time: "昨天",
    content: `跟进中的重点客户"Maison Élégance SARL"的"高杆照明灯采购案"状态已变更为寄送样品。`,
    severity: "important",
  },
];

// 右侧情报快讯数据
interface IntelNews {
  id: string;
  title: string;
  source: string;
  time: string;
  severity: "normal" | "important" | "urgent";
}

const mockIntelNews: IntelNews[] = [
  {
    id: "intel-1",
    title: "美国西海岸港口谈判陷入僵局，下周或面临集装箱装卸停滞风险",
    source: "航运界网",
    time: "10分钟前",
    severity: "urgent",
  },
  {
    id: "intel-2",
    title: "竞品 BrightPath 在亚马逊平台调低多款户外高杆灯价格 5% - 8%",
    source: "竞品监测",
    time: "30分钟前",
    severity: "important",
  },
  {
    id: "intel-3",
    title: "人民币兑美元汇率中间价今天调贬 85 个基点，报 7.2340",
    source: "外汇交易中心",
    time: "1小时前",
    severity: "normal",
  },
  {
    id: "intel-4",
    title: "欧盟对华 LED 户外照明产品展开的调查引起了多家华东大厂警惕",
    source: "海关观察",
    time: "2小时前",
    severity: "important",
  },
  {
    id: "intel-5",
    title: "2026年5月份中欧班列累计开行 1720 列，货运量创新高",
    source: "中国铁路",
    time: "4小时前",
    severity: "normal",
  },
];

// ============================================================
// 页面组件
// ============================================================

export default function DashboardPage() {
  const mounted = useMounted();

  // 大盘统计数据（TanStack Query，staleTime: 30s）
  const { stats, isLoading } = useDashboardStats();

  // 根据真实数据构建图表数据，fallback 为空数组
  const chartData = stats?.weeklyWorkflowRuns?.map((d) => ({
    name: d.day,
    成功: d.success,
    失败: d.failed,
  })) ?? [];

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader
          title="动态大盘"
          description="外贸动态经营与数据概览"
        />

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
              <StatCard
                title="待办任务"
                value={stats?.pendingTasks ?? 0}
                icon={ClipboardList}
                isLoading={isLoading}
              />
              <StatCard
                title="活跃项目"
                value={stats?.activeProjects ?? 0}
                icon={Target}
                isLoading={isLoading}
              />
            </div>

            {/* 主要内容区 - 2个核心卡片 */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

              {/* 卡片1: 外贸动态流（暂保留 mock 占位） */}
              <div className="bg-card rounded-2xl border border-border p-5 flex flex-col justify-between min-h-[300px]">
                <div>
                  <h3 className="text-foreground font-semibold text-base mb-4">外贸动态流</h3>
                  <div className="divide-y divide-border/50">
                    {mockActivities.map((item) => (
                      <div key={item.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-4">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-hint text-xs">{item.time}</span>
                            <span
                              className={cn(
                                "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                                item.severity === "urgent" && "bg-danger/10 text-danger border-danger/20",
                                item.severity === "important" && "bg-warning/10 text-warning border-warning/20",
                                item.severity === "normal" && "bg-success/10 text-success border-success/20"
                              )}
                            >
                              {item.severity === "urgent" && "紧急"}
                              {item.severity === "important" && "重要"}
                              {item.severity === "normal" && "普通"}
                            </span>
                          </div>
                          <p className="text-foreground text-sm leading-relaxed">{item.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 卡片2: 本周工作流执行概览（接入真实聚合数据） */}
              <div className="bg-card rounded-2xl border border-border p-5 flex flex-col justify-between min-h-[300px]">
                <div>
                  <h3 className="text-foreground font-semibold text-base mb-4">本周工作流执行概览</h3>
                  {mounted ? (
                    chartData.length > 0 ? (
                      <div className="w-full h-[200px] mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2A2A31" vertical={false} />
                            <XAxis
                              dataKey="name"
                              stroke="#71717A"
                              fontSize={11}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              stroke="#71717A"
                              fontSize={11}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#18181B",
                                border: "1px solid #2A2A31",
                                borderRadius: "8px",
                                color: "#F5F5F7",
                              }}
                            />
                            <Bar name="成功" dataKey="成功" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                            <Bar name="失败" dataKey="失败" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-[200px] mt-4 flex items-center justify-center text-hint text-xs bg-accent/5 rounded-xl border border-border/30">
                        {isLoading ? "数据加载中..." : "本周暂无工作流执行数据"}
                      </div>
                    )
                  ) : (
                    <div className="h-[200px] mt-4 flex items-center justify-center text-hint text-xs bg-accent/5 rounded-xl border border-border/30">
                      图表加载中...
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>

          {/* 右侧面板（情报快讯暂保留 mock） */}
          <div className="w-full lg:w-80 shrink-0 bg-card rounded-2xl border border-border p-5 h-fit space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-foreground font-semibold text-base">情报快讯</h3>
              <Link href="#" className="text-brand-blue hover:underline text-xs flex items-center gap-1">
                查看全部
                <ExternalLink className="size-3" />
              </Link>
            </div>

            {/* 情报卡片列表 */}
            <div className="flex flex-col">
              {mockIntelNews.map((item) => (
                <div
                  key={item.id}
                  className="relative bg-card rounded-xl border border-border p-3 mb-2 last:mb-0 flex flex-col gap-1.5 transition-all hover:bg-hover hover:border-border/80"
                >
                  {/* 右上角重要性色点 */}
                  <div
                    className={cn(
                      "absolute top-3.5 right-3.5 w-2 h-2 rounded-full",
                      item.severity === "urgent" && "bg-danger",
                      item.severity === "important" && "bg-warning",
                      item.severity === "normal" && "bg-success"
                    )}
                  />
                  <h4 className="text-foreground text-sm font-medium pr-6 leading-snug">
                    {item.title}
                  </h4>
                  <div className="flex items-center gap-2 text-hint text-xs">
                    <span>{item.source}</span>
                    <span>•</span>
                    <span>{item.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </PageTransition>
  );
}

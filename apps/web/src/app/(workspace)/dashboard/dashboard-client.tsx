"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Layers,
  Zap,
  Cpu,
  RefreshCw as RefreshIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { cn } from "@/lib/utils";

// 动态懒加载 Recharts 图表，防止 SSR 报错并提升性能
const TaskLineChart = dynamic(() => import("./_components/task-line-chart"), {
  ssr: false,
  loading: () => <div className="h-[220px] flex items-center justify-center text-hint text-xs">图表加载中...</div>,
});
const FunnelBarChart = dynamic(() => import("./_components/funnel-bar-chart"), {
  ssr: false,
  loading: () => <div className="h-[220px] flex items-center justify-center text-hint text-xs">图表加载中...</div>,
});
const WorkflowDonutChart = dynamic(() => import("./_components/workflow-donut-chart"), {
  ssr: false,
  loading: () => <div className="h-[220px] flex items-center justify-center text-hint text-xs">图表加载中...</div>,
});

export interface DashboardData {
  platform: {
    activeWorkspaces: number;
    avgDailyTasks: number;
    workflowRunsByStatus: { completed: number; failed: number; running: number; cancelled: number };
    installedPackCount: number;
    proposalApprovalRate: number;
    rollbackRate: number;
  };
  execution: {
    taskCompletionRate: number;
    connectorSuccessRate: number;
    avgEventLatencyMs: number;
    humanInterventionRate: number;
    receiptCompletenessRate: number;
  };
  evolution: {
    proposalAdoptionRate: number;
    canarySuccessRate: number;
    avgMemoryHitRate: number;
  };
  prev: {
    platform: Record<string, any>;
    execution: Record<string, any>;
    evolution: Record<string, any>;
  };
  dailyWorkflowRuns: { date: string; count: number }[];
  updatedAt: string;
}

interface FunnelDatum {
  name: string;
  value: number;
}

export default function DashboardClient({
  initialData,
  period: initialPeriod,
}: {
  initialData: DashboardData | null;
  period: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [period, setPeriod] = useState(initialPeriod);
  const [data, setData] = useState<DashboardData | null>(initialData);
  const [funnelData, setFunnelData] = useState<FunnelDatum[]>([]);
  const [isFunnelLoading, setIsFunnelLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(!initialData);

  // 1. 切换 period 时重新获取大盘指标
  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    setIsDataLoading(true);
    
    startTransition(() => {
      router.push(`/dashboard?period=${newPeriod}`);
    });

    fetch(`/api/dashboard?period=${newPeriod}`)
      .then((res) => {
        if (!res.ok) throw new Error("获取指标失败");
        return res.json();
      })
      .then((json) => {
        setData(json);
        setIsDataLoading(false);
      })
      .catch((err) => {
        console.error("Failed to reload metrics:", err);
        setIsDataLoading(false);
      });
  };

  // 2. 异步拉取外贸漏斗转化数据 (Inquiry -> Quote -> Order)
  const fetchFunnelData = () => {
    setIsFunnelLoading(true);
    fetch("/api/foreign-trade/funnel")
      .then((res) => {
        if (!res.ok) throw new Error("获取漏斗失败");
        return res.json();
      })
      .then((json) => {
        setFunnelData(json.data || []);
        setIsFunnelLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load funnel:", err);
        setIsFunnelLoading(false);
      });
  };

  useEffect(() => {
    fetchFunnelData();
  }, []);

  // 30秒轮询
  useEffect(() => {
    const poll = setInterval(() => {
      fetch(`/api/dashboard?period=${period}`)
        .then((res) => res.json())
        .then((json) => setData(json))
        .catch(console.error);
      fetchFunnelData();
    }, 30000);
    return () => clearInterval(poll);
  }, [period]);

  // 状态色判定辅助函数
  const getStatusStyle = (key: string, value: number) => {
    if (key === "connectorSuccessRate" && value < 0.85) return "red";
    if (key === "taskCompletionRate" && value < 0.80) return "red";
    if (key === "humanInterventionRate" && value > 0.15) return "orange";
    if (key === "avgMemoryHitRate" && value < 0.70) return "orange";

    if (["proposalApprovalRate", "proposalAdoptionRate", "canarySuccessRate", "receiptCompletenessRate"].includes(key)) {
      if (value < 0.60) return "red";
      if (value < 0.80) return "orange";
      return "green";
    }
    if (key === "rollbackRate") {
      if (value > 0.10) return "red";
      if (value > 0.05) return "orange";
      return "green";
    }
    return "green";
  };

  // 趋势比对渲染辅助函数
  const renderTrend = (curr: number, prev: number) => {
    if (curr === prev || isNaN(curr) || isNaN(prev)) return <span className="text-hint">——</span>;
    const isUp = curr > prev;
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-bold", isUp ? "text-success" : "text-danger")}>
        {isUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
        {isUp ? "↑" : "↓"}
      </span>
    );
  };

  // 数字格式化输出
  const formatValue = (key: string, val: number) => {
    if (typeof val !== "number" || isNaN(val)) return "0.0%";
    if (["activeWorkspaces", "installedPackCount"].includes(key)) {
      return Math.round(val).toLocaleString();
    }
    if (key === "avgDailyTasks") {
      return val.toFixed(1);
    }
    if (key === "avgEventLatencyMs") {
      return (val / 1000).toFixed(2) + "s";
    }
    return (val * 100).toFixed(1) + "%";
  };

  // 卡片背景与边框色彩样式
  const getCardStyle = (color: string) => {
    if (color === "red") return "border-danger/30 hover:border-danger/50 bg-danger/5";
    if (color === "orange") return "border-warning/30 hover:border-warning/50 bg-warning/5";
    return "border-border hover:border-primary/20 bg-card/40";
  };

  // 卡片文字颜色
  const getTextColor = (color: string) => {
    if (color === "red") return "text-danger";
    if (color === "orange") return "text-warning";
    return "text-success";
  };

  if (isDataLoading && !data) {
    return (
      <div className="p-6 h-[80vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <span className="text-hint text-xs">加载系统监控大盘指标中...</span>
      </div>
    );
  }

  const m = data!;

  const donutData = [
    { name: "已完成", value: m.platform.workflowRunsByStatus.completed },
    { name: "已失败", value: m.platform.workflowRunsByStatus.failed },
    { name: "运行中", value: m.platform.workflowRunsByStatus.running },
    { name: "已取消", value: m.platform.workflowRunsByStatus.cancelled },
  ];

  return (
    <PageTransition>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* 顶部标题与 Period 切换 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-3">
          <PageHeader
            title="动态大盘"
            description="HermesClaw 控制内核与运行时监控大盘"
          />

          <div className="flex items-center gap-3 self-start md:self-auto">
            {isPending && <Loader2 className="size-3 animate-spin text-primary" />}
            {m.updatedAt && (
              <span className="text-hint text-[10px] tabular-nums">
                数据刷新于：{new Date(m.updatedAt).toLocaleTimeString()}
              </span>
            )}
            <div className="flex items-center gap-1 bg-accent/50 rounded-xl p-1 border border-border/40">
              {[
                { value: "7d", label: "7 天" },
                { value: "30d", label: "30 天" },
              ].map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handlePeriodChange(t.value)}
                  className={cn(
                    "text-xs font-semibold px-4 py-1.5 rounded-lg transition-all",
                    period === t.value
                      ? "bg-primary text-primary-foreground shadow-sm font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3 列 KPI 指标网格 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 第一列：平台指标 */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-hint flex items-center gap-1.5 uppercase tracking-wider">
              <Layers className="size-4 text-primary" /> 平台治理指标 (Platform)
            </h3>
            <div className="space-y-3">
              {[
                { key: "activeWorkspaces", label: "周活企业数", icon: Activity, desc: "近7天发生过工作流运行的租户数" },
                { key: "avgDailyTasks", label: "日均任务数", icon: Activity, desc: "当前周期内每天运行的工作流平均数" },
                { key: "installedPackCount", label: "Industry Pack 启用数", icon: Activity, desc: "当前工作空间已安装并启用的行业插件" },
                { key: "proposalApprovalRate", label: "提案通过率", icon: Activity, desc: "近30天审批通过的提案占总审批的比率" },
                { key: "rollbackRate", label: "配置回滚率", icon: Activity, desc: "近30天由于异常触发回滚的工作流占比" },
              ].map((kpi) => {
                const currVal = (m.platform as any)[kpi.key];
                const prevVal = (m.prev.platform as any)[kpi.key];
                const color = getStatusStyle(kpi.key, currVal);
                return (
                  <div
                    key={kpi.key}
                    className={cn(
                      "border backdrop-blur-md rounded-2xl p-4 transition-all flex items-center justify-between gap-4",
                      getCardStyle(color)
                    )}
                  >
                    <div className="space-y-1 min-w-0">
                      <span className="text-muted-foreground text-xs font-medium truncate block" title={kpi.desc}>
                        {kpi.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-2xl font-bold tracking-tight", getTextColor(color))}>
                          {formatValue(kpi.key, currVal)}
                        </span>
                        {renderTrend(currVal, prevVal)}
                      </div>
                    </div>
                    <div className={cn("rounded-xl p-2 shrink-0 border bg-background/40", 
                      color === "red" ? "border-danger/20 text-danger" :
                      color === "orange" ? "border-warning/20 text-warning" : "border-success/20 text-success"
                    )}>
                      <kpi.icon className="size-4" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 第二列：执行指标 */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-hint flex items-center gap-1.5 uppercase tracking-wider">
              <Zap className="size-4 text-warning" /> 执行可靠指标 (Execution)
            </h3>
            <div className="space-y-3">
              {[
                { key: "taskCompletionRate", label: "任务完成率", icon: Activity, desc: "WorkflowRun 完成成功次数占比（7天<80%红牌）" },
                { key: "connectorSuccessRate", label: "连接器成功率", icon: Activity, desc: "底层信件/物理交互发送的成功占比（<85%红牌）" },
                { key: "avgEventLatencyMs", label: "系统响应延迟", icon: Activity, desc: "工作流的各节点平均运行总时长" },
                { key: "humanInterventionRate", label: "人工介入率", icon: Activity, desc: "需人工介入审批的拦截次数占比（>15%橙牌）" },
                { key: "receiptCompletenessRate", label: "收据对账完整率", icon: Activity, desc: "底层完成且能完整返回对账回执的比例" },
              ].map((kpi) => {
                const currVal = (m.execution as any)[kpi.key];
                const prevVal = (m.prev.execution as any)[kpi.key];
                const color = getStatusStyle(kpi.key, currVal);
                return (
                  <div
                    key={kpi.key}
                    className={cn(
                      "border backdrop-blur-md rounded-2xl p-4 transition-all flex items-center justify-between gap-4",
                      getCardStyle(color)
                    )}
                  >
                    <div className="space-y-1 min-w-0">
                      <span className="text-muted-foreground text-xs font-medium truncate block" title={kpi.desc}>
                        {kpi.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-2xl font-bold tracking-tight", getTextColor(color))}>
                          {formatValue(kpi.key, currVal)}
                        </span>
                        {renderTrend(currVal, prevVal)}
                      </div>
                    </div>
                    <div className={cn("rounded-xl p-2 shrink-0 border bg-background/40", 
                      color === "red" ? "border-danger/20 text-danger" :
                      color === "orange" ? "border-warning/20 text-warning" : "border-success/20 text-success"
                    )}>
                      <kpi.icon className="size-4" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 第三列：进化指标 */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-hint flex items-center gap-1.5 uppercase tracking-wider">
              <Cpu className="size-4 text-success" /> 进化演化指标 (Evolution)
            </h3>
            <div className="space-y-3">
              {[
                { key: "proposalAdoptionRate", label: "提案采纳率", icon: Activity, desc: "近30天自动演化生成的配置采纳度" },
                { key: "canarySuccessRate", label: "灰度成功率", icon: Activity, desc: "近30天成功晋级激活的 Canary 灰度占比" },
                { key: "avgMemoryHitRate", label: "记忆检索命中率", icon: Activity, desc: "评估报告生成的短期记忆命中占比（<70%橙牌）" },
              ].map((kpi) => {
                const currVal = (m.evolution as any)[kpi.key];
                const prevVal = (m.prev.evolution as any)[kpi.key];
                const color = getStatusStyle(kpi.key, currVal);
                return (
                  <div
                    key={kpi.key}
                    className={cn(
                      "border backdrop-blur-md rounded-2xl p-4 transition-all flex items-center justify-between gap-4",
                      getCardStyle(color)
                    )}
                  >
                    <div className="space-y-1 min-w-0">
                      <span className="text-muted-foreground text-xs font-medium truncate block" title={kpi.desc}>
                        {kpi.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-2xl font-bold tracking-tight", getTextColor(color))}>
                          {formatValue(kpi.key, currVal)}
                        </span>
                        {renderTrend(currVal, prevVal)}
                      </div>
                    </div>
                    <div className={cn("rounded-xl p-2 shrink-0 border bg-background/40", 
                      color === "red" ? "border-danger/20 text-danger" :
                      color === "orange" ? "border-warning/20 text-warning" : "border-success/20 text-success"
                    )}>
                      <kpi.icon className="size-4" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 下方图表网格 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：折线图 - 任务运行量 */}
          <div className="bg-card/45 border border-border backdrop-blur-md rounded-2xl p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-foreground font-semibold text-sm">运行任务量趋势</h3>
                <p className="text-[10px] text-hint mt-0.5">展示每日的工作流启动与完成总计</p>
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground bg-accent/40 px-2 py-0.5 rounded-lg border border-border">
                {period === "30d" ? "最近 30 天" : "最近 7 天"}
              </span>
            </div>
            {m.dailyWorkflowRuns && m.dailyWorkflowRuns.length > 0 ? (
              <TaskLineChart data={m.dailyWorkflowRuns} />
            ) : (
              <div className="h-[220px] flex items-center justify-center text-hint text-xs">
                本周期暂无工作流运行轨迹
              </div>
            )}
          </div>

          {/* 右侧：饼图 - Workflow 状态机比例 */}
          <div className="bg-card/45 border border-border backdrop-blur-md rounded-2xl p-5">
            <div>
              <h3 className="text-foreground font-semibold text-sm">任务状态分布</h3>
              <p className="text-[10px] text-hint mt-0.5">反映运行时各执行状态所占的比重</p>
            </div>
            <WorkflowDonutChart data={donutData} />
          </div>
        </div>

        {/* 底部：条形图 - 外贸转化漏斗 */}
        <div className="bg-card/45 border border-border backdrop-blur-md rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-foreground font-semibold text-sm">外贸转化漏斗</h3>
              <p className="text-[10px] text-hint mt-0.5">反映客户从询盘 (Inquiry) → 报价 (Quote) → 成交订单 (Order) 的流转效率</p>
            </div>
            <button
              onClick={fetchFunnelData}
              className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 bg-accent/30 p-1.5 rounded-lg transition-colors border border-border/40"
              disabled={isFunnelLoading}
            >
              {isFunnelLoading ? <Loader2 className="size-3 animate-spin" /> : <RefreshIcon className="size-3" />}
              刷新漏斗
            </button>
          </div>
          {isFunnelLoading ? (
            <div className="h-[220px] flex items-center justify-center text-hint text-xs">
              外贸漏斗聚合分析中...
            </div>
          ) : funnelData.length > 0 ? (
            <FunnelBarChart data={funnelData} />
          ) : (
            <div className="h-[220px] flex items-center justify-center text-hint text-xs">
              当前暂无询盘和报价流转记录
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Loader2,
  Layers,
  Zap,
  Cpu,
  RefreshCw as RefreshIcon,
  ClipboardCheck,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { cn } from "@/lib/utils";
import { PackUpgradeModal } from "@/components/common/pack-upgrade-modal";


// 动态懒加载 Recharts 图表，防止 SSR 报错并提升性能
const TaskLineChart = dynamic(() => import("./_components/task-line-chart"), {
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

// ============================================================
// 纯函数：状态色 / 趋势 / 格式化 / 卡片样式（提取到组件外避免每帧重建）
// ============================================================

function getStatusStyle(key: string, value: number): "red" | "orange" | "green" {
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
}

function formatValue(key: string, val: number): string {
  if (typeof val !== "number" || isNaN(val)) return "0.0%";
  if (["activeWorkspaces", "installedPackCount"].includes(key)) return Math.round(val).toLocaleString();
  if (key === "avgDailyTasks") return val.toFixed(1);
  if (key === "avgEventLatencyMs") return (val / 1000).toFixed(2) + "s";
  return (val * 100).toFixed(1) + "%";
}

const PERIODS = [
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
] as const;

// KPI 定义提取到组件外部，确保稳定引用（避免每帧重建）
// 注：KpiColumn props 类型期望可变数组，因此不加 as const
const platformKpis = [
  { key: "activeWorkspaces", label: "周活企业数", icon: Activity, desc: "近7天发生过工作流运行的租户数" },
  { key: "avgDailyTasks", label: "日均任务数", icon: Activity, desc: "当前周期内每天运行的工作流平均数" },
  { key: "installedPackCount", label: "Industry Pack 启用数", icon: Activity, desc: "当前工作空间已安装并启用的行业插件" },
  { key: "proposalApprovalRate", label: "提案通过率", icon: Activity, desc: "近30天审批通过的提案占总审批的比率" },
  { key: "rollbackRate", label: "配置回滚率", icon: Activity, desc: "近30天由于异常触发回滚的工作流占比" },
];

const executionKpis = [
  { key: "taskCompletionRate", label: "任务完成率", icon: Activity, desc: "WorkflowRun 完成成功次数占比" },
  { key: "connectorSuccessRate", label: "连接器成功率", icon: Activity, desc: "底层信件/物理交互发送的成功占比" },
  { key: "avgEventLatencyMs", label: "系统响应延迟", icon: Activity, desc: "工作流的各节点平均运行总时长" },
  { key: "humanInterventionRate", label: "人工介入率", icon: Activity, desc: "需人工介入审批的拦截次数占比" },
  { key: "receiptCompletenessRate", label: "收据对账完整率", icon: Activity, desc: "底层完成且能完整返回对账回执的比例" },
];

const evolutionKpis = [
  { key: "proposalAdoptionRate", label: "提案采纳率", icon: Activity, desc: "近30天自动演化生成的配置采纳度" },
  { key: "canarySuccessRate", label: "灰度成功率", icon: Activity, desc: "近30天成功晋级激活的 Canary 灰度占比" },
  { key: "avgMemoryHitRate", label: "记忆检索命中率", icon: Activity, desc: "评估报告生成的短期记忆命中占比" },
];

// ============================================================
// KPI 卡片（memo 隔离，避免父组件 state 变更导致每张卡片重渲染）
// ============================================================

function KpiCard({
  kpi,
  currVal,
  prevVal,
}: {
  kpi: { key: string; label: string; icon: any; desc: string };
  currVal: number;
  prevVal: number;
}) {
  const color = getStatusStyle(kpi.key, currVal);

  const cardStyle = color === "red"
    ? "border-danger/30 hover:border-danger/50 bg-danger/5"
    : color === "orange"
      ? "border-warning/30 hover:border-warning/50 bg-warning/5"
      : "border-border hover:border-primary/20 bg-card/40";

  const textColor = color === "red" ? "text-danger" : color === "orange" ? "text-warning" : "text-success";

  const iconColor =
    color === "red" ? "border-danger/20 text-danger" :
    color === "orange" ? "border-warning/20 text-warning" : "border-success/20 text-success";

  return (
    <div className={cn("border backdrop-blur-md rounded-2xl p-4 transition-all flex items-center justify-between gap-4", cardStyle)}>
      <div className="space-y-1 min-w-0">
        <span className="text-muted-foreground text-xs font-medium truncate block" title={kpi.desc}>
          {kpi.label}
        </span>
        <div className="flex items-center gap-2">
          <span className={cn("text-2xl font-bold tracking-tight", textColor)}>
            {formatValue(kpi.key, currVal)}
          </span>
          <TrendBadge curr={currVal} prev={prevVal} />
        </div>
      </div>
      <div className={cn("rounded-xl p-2 shrink-0 border bg-background/40", iconColor)}>
        <kpi.icon className="size-4" />
      </div>
    </div>
  );
}

function TrendBadge({ curr, prev }: { curr: number; prev: number }) {
  if (curr === prev || isNaN(curr) || isNaN(prev)) return <span className="text-hint">——</span>;
  const isUp = curr > prev;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-bold", isUp ? "text-success" : "text-danger")}>
      {isUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {isUp ? "↑" : "↓"}
    </span>
  );
}

// ============================================================
// 主组件
// ============================================================

export default function DashboardClient({
  initialData,
  period: initialPeriod,
  pendingApprovalCount = 0,
}: {
  initialData: DashboardData | null;
  period: string;
  pendingApprovalCount?: number;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState(initialPeriod);

  // 查询已安装包，用于多开检测
  const { data: installedPacksData } = useQuery<any[]>({
    queryKey: ["installed-packs"],
    queryFn: async () => {
      const res = await fetch("/api/industry-packs");
      const json = await res.json();
      return json.packs || json.data?.packs || [];
    }
  });

  const activePacks = (installedPacksData || [])
    .filter((p: any) => p.status === "installed")
    .filter((p: any) => {
      const targetInd = (p.manifest as any)?.targetIndustry || (p.manifest as any)?.industry;
      return targetInd && targetInd !== "general";
    });

  // 提取第一个活跃行业包的 industryId（供 Panel 2 过滤推荐工作流）
  const activeIndustryId: string | null =
    activePacks.length > 0
      ? (activePacks[0] as any)?.manifest?.targetIndustry ||
        (activePacks[0] as any)?.manifest?.industry ||
        null
      : null;

  // ── P2 修复：使用 TanStack Query 替代原始 fetch ──
  //   staleTime: 30s（与后端缓存对齐）→ 页面切换不重复请求
  //   refetchInterval: 60s（降低轮询频率）→ 减少后端压力
  //   placeholderData: initialData（SSR 数据直接展示，无闪烁）

  const {
    data: dashboardData,
    isLoading: isDataLoading,
  } = useQuery<DashboardData>({
    queryKey: ["dashboard", period],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?period=${period}`);
      if (!res.ok) throw new Error("获取指标失败");
      return res.json();
    },
    staleTime: 30_000,       // 30s 内优先用缓存
    refetchInterval: 60_000, // 60s 轮询（原 30s → 减少后端压力）
    placeholderData: initialData ?? undefined,
    retry: 2,
  });



  // 切换 period
  const handlePeriodChange = useCallback((newPeriod: string) => {
    setPeriod(newPeriod);
    router.push(`/dashboard?period=${newPeriod}`);
  }, [router]);

  // ── 初始加载骨架屏 ──
  if (isDataLoading && !dashboardData) {
    return (
      <div className="p-6 h-[80vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <span className="text-hint text-xs">加载系统监控大盘指标中...</span>
      </div>
    );
  }

  const m = dashboardData;

  if (!m?.platform) {
    return (
      <div className="p-6 h-[80vh] flex flex-col items-center justify-center gap-4">
        <p className="text-hint text-sm">正在初始化数据库…</p>
        <p className="text-xs text-zinc-600">首次连接 Neon PostgreSQL，请稍候刷新页面</p>
      </div>
    );
  }

  const donutData = [
    { name: "已完成", value: m.platform.workflowRunsByStatus?.completed ?? 0 },
    { name: "已失败", value: m.platform.workflowRunsByStatus?.failed ?? 0 },
    { name: "运行中", value: m.platform.workflowRunsByStatus?.running ?? 0 },
    { name: "已取消", value: m.platform.workflowRunsByStatus?.cancelled ?? 0 },
  ];

  return (
    <PageTransition>
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="flex gap-6 items-start">
          {/* ═══════════════ 主内容区 ═══════════════ */}
          <div className="flex-1 min-w-0 space-y-6">
            <PackUpgradeModal />

        {/* 多个行业包同时激活的冲突阻断 Banner 警告 */}
        {activePacks.length > 1 && (
          <div className="w-full p-4 border border-destructive/20 bg-destructive/10 rounded-2xl flex items-center justify-between text-sm text-destructive backdrop-blur-sm shadow-sm select-none animate-pulse">
            <div className="flex items-center gap-2.5">
              <span>⚠️</span>
              <span className="font-semibold">
                系统警告：检测到您同时启用了多个行业包（如：外贸包等），这可能会导致智能员工的职责和执行决策产生混乱。请暂停停用无关的行业包以防止数据交叉污染！
              </span>
            </div>
            <button
              onClick={() => router.push('/settings/industry-packs')}
              className="text-xs font-bold underline hover:opacity-80 shrink-0 ml-4"
            >
              立即停用 →
            </button>
          </div>
        )}
        {/* 待审批入口：仅在存在 pending checkpoint 时展示 */}
        {pendingApprovalCount > 0 && (
          <div className="w-full p-4 border border-warning/30 bg-warning/5 rounded-2xl flex items-center justify-between backdrop-blur-sm shadow-sm">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="size-4 text-warning" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  有 {pendingApprovalCount} 项高危任务等待审批
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  L3/L4 风险级别的运行时任务拦截审批，点击立即处理进入审批决策面板
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push("/workspace/approvals")}
              className="bg-warning hover:bg-warning/90 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-colors shadow-sm shrink-0 ml-4"
            >
              <ClipboardCheck className="size-3.5" />
              立即处理
              <ArrowRight className="size-3" />
            </button>
          </div>
        )}
        {/* 顶部标题与 Period 切换 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-3">
          <PageHeader
            title="动态大盘"
            description="HermesClaw 控制内核与运行时监控大盘"
          />

          <div className="flex items-center gap-3 self-start md:self-auto">
            {m.updatedAt && (
              <span className="text-hint text-[10px] tabular-nums">
                数据刷新于：{new Date(m.updatedAt).toLocaleTimeString()}
              </span>
            )}
            <div className="flex items-center gap-1 bg-accent/50 rounded-xl p-1 border border-border/40">
              {PERIODS.map((t) => (
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
          <KpiColumn title="平台治理指标 (Platform)" icon={Layers} color="text-primary" kpis={platformKpis} data={m.platform} prev={m.prev.platform} />
          <KpiColumn title="执行可靠指标 (Execution)" icon={Zap} color="text-warning" kpis={executionKpis} data={m.execution} prev={m.prev.execution} />
          <KpiColumn title="进化演化指标 (Evolution)" icon={Cpu} color="text-success" kpis={evolutionKpis} data={m.evolution} prev={m.prev.evolution} />
        </div>

        {/* 下方图表网格 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

          <div className="bg-card/45 border border-border backdrop-blur-md rounded-2xl p-5">
            <div>
              <h3 className="text-foreground font-semibold text-sm">任务状态分布</h3>
              <p className="text-[10px] text-hint mt-0.5">反映运行时各执行状态所占的比重</p>
            </div>
            <WorkflowDonutChart data={donutData} />
          </div>
        </div>


        {/* ═══════════════ 主内容区结束 ═══════════════ */}
        </div>



        {/* ═══════════════ 双栏容器结束 ═══════════════ */}
        </div>
      </div>
    </PageTransition>
  );
}

/** KPI 列组件（消除组件内 map 重复） */
function KpiColumn({
  title,
  icon: IconComponent,
  color,
  kpis,
  data,
  prev,
}: {
  title: string;
  icon: any;
  color: string;
  kpis: { key: string; label: string; icon: any; desc: string }[];
  data: Record<string, any>;
  prev: Record<string, any>;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-hint flex items-center gap-1.5 uppercase tracking-wider">
        <IconComponent className={cn("size-4", color)} /> {title}
      </h3>
      <div className="space-y-3">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} currVal={data[kpi.key]} prevVal={prev[kpi.key]} />
        ))}
      </div>
    </div>
  );
}

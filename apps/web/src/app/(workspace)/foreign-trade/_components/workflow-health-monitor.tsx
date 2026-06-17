"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  AlertTriangle,
  Loader2,
  RefreshCw,
  History,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// API 返回数据契约接口
interface HealthData {
  successRate: number;
  errorRate: number;
  avgDurationMs: number;
  totalRuns: number;
  recentRuns: Array<{
    id: string;
    workflowId: string;
    status: string;
    trigger: string;
    startedAt: string;
    finishedAt: string | null;
    error: string | null;
  }>;
  nodeRuns: Array<{
    id: string;
    runId: string;
    nodeId: string;
    kind: string;
    status: string;
    error: string | null;
    finishedAt: string | null;
  }>;
  evolutionLogs: Array<{
    id: string;
    triggeredBy: string;
    evaluatedAt: string;
    triggered: boolean;
    errorRate: number;
    successRate: number;
    totalLogs: number;
    model: string | null;
    reason: string | null;
    reportMd: string | null;
    reportId: string | null;
    analysisDurationSeconds: number | null;
  }>;
  auditLogs: Array<{
    id: string;
    actor: string;
    action: string;
    targetType: string;
    targetId: string;
    detail: string | null;
    riskLevel: string | null;
    automationLevel: string | null;
    triggeredBy: string;
    createdAt: string;
  }>;
}

// 映射工作流中文名
const WORKFLOW_NAME_MAP: Record<string, string> = {
  "inquiry-grade": "询盘分级",
  "dev-letter": "开发信生成",
  "customer-profile": "客户画像构建",
  "quote-gen": "报价生成",
  "sample-mgmt": "样品管理",
  "order-push": "订单推进",
  "exhibition-leads": "展会线索整理",
  "followup-remind": "客户跟进提醒",
  "trade-inquiry-followup": "询盘智能跟进",
  "trade-lead-nurture": "展会线索转化",
};

export function WorkflowHealthMonitor() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // TanStack Query 自动拉取外贸健康数据，开启 15s 自动轮询与 1 次失败重试机制
  const { data, isLoading, isError, error, refetch } = useQuery<HealthData>({
    queryKey: ["foreign-trade-health"],
    queryFn: async () => {
      const res = await fetch("/api/foreign-trade/health");
      if (!res.ok) throw new Error("获取外贸健康度失败");
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "未知错误");
      return json.data;
    },
    refetchInterval: 15000, // 每 15s 轮询一次
    retry: 1, // 失败时自动重试 1 次
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // 1. 加载中状态骨架屏
  if (isLoading) {
    return (
      <div className="bg-card/45 backdrop-blur-md rounded-2xl border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="text-primary size-4 animate-pulse" />
            <span className="text-foreground text-sm font-semibold">健康度监测</span>
          </div>
          <Loader2 className="size-4 text-muted-foreground animate-spin" />
        </div>
        <div className="space-y-3 pt-2">
          <div className="h-20 bg-accent/30 rounded-xl animate-pulse" />
          <div className="h-32 bg-accent/30 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  // 2. 异常报错状态容错卡片（带有一键重试连接功能）
  if (isError) {
    return (
      <div className="bg-card/45 backdrop-blur-md rounded-2xl border border-destructive/20 p-5 space-y-3">
        <div className="flex items-center gap-2 text-danger">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="text-xs font-semibold">监控数据连接中断</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {error instanceof Error ? error.message : "获取健康度指标或自演化日志失败，请检查网络或稍后重试。"}
        </p>
        <button
          onClick={() => refetch()}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-destructive/10 text-danger hover:bg-destructive/15 active:scale-[0.98] transition-all text-xs font-medium border border-destructive/20"
        >
          <RefreshCw className="size-3.5" />
          重试连接
        </button>
      </div>
    );
  }

  const health = data || {
    successRate: 1,
    errorRate: 0,
    avgDurationMs: 0,
    totalRuns: 0,
    recentRuns: [],
    nodeRuns: [],
    evolutionLogs: [],
    auditLogs: [],
  };

  // 检测最近 48 小时内有无自演化降级决策记录
  const downgradeLogs = health.auditLogs.filter(
    (log) =>
      log.action.includes("downgrade") ||
      log.detail?.includes("降级") ||
      log.detail?.includes("拦截")
  );
  const hasDowngrade = downgradeLogs.length > 0;

  return (
    <div className="bg-card/45 backdrop-blur-md rounded-2xl border border-border p-4 space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className={cn("size-4", health.errorRate > 0.15 ? "text-warning animate-pulse" : "text-success")} />
          <span className="text-foreground text-xs font-semibold">自演化与健康监测</span>
        </div>
        <button
          onClick={handleRefresh}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          title="手动刷新"
        >
          <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
        </button>
      </div>

      {/* 核心指标微型网格 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-background/40 border border-border/60 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[10px] text-muted-foreground font-medium">执行成功率</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-lg font-bold text-foreground tabular-nums">
              {(health.successRate * 100).toFixed(0)}%
            </span>
            {health.successRate >= 0.85 ? (
              <span className="text-[9px] text-success font-medium">健康</span>
            ) : (
              <span className="text-[9px] text-danger font-medium">告警</span>
            )}
          </div>
        </div>
        <div className="bg-background/40 border border-border/60 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[10px] text-muted-foreground font-medium">平均执行时效</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-lg font-bold text-foreground tabular-nums">
              {health.avgDurationMs > 0 ? `${(health.avgDurationMs / 1000).toFixed(1)}s` : "0s"}
            </span>
            <Clock className="size-2.5 text-hint" />
          </div>
        </div>
      </div>

      {/* 自演化降级警示 Banner */}
      {hasDowngrade && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 text-xs space-y-1.5 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-1.5 text-warning font-semibold">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>自演化引擎干预警告</span>
          </div>
          <p className="text-muted-foreground leading-relaxed text-[11px]">
            检测到有工作流执行异常，已自动触发 Harness 降级策略（例：L2 自动降为 L3 人工审核）。
          </p>
          <div className="border-t border-warning/15 pt-1.5 mt-1 space-y-1">
            {downgradeLogs.slice(0, 2).map((log) => (
              <div key={log.id} className="text-[10px] text-muted-foreground flex justify-between gap-2">
                <span className="truncate flex-1 text-foreground/80">{log.detail}</span>
                <span className="shrink-0 text-hint">
                  {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 最近执行明细 */}
      <div className="space-y-2">
        <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
          <History className="size-3" />
          最近执行记录
        </span>

        {health.recentRuns.length === 0 ? (
          <p className="text-[11px] text-hint py-4 text-center">暂无执行历史</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {health.recentRuns.slice(0, 5).map((run) => {
              const isSuccess = run.status === "completed";
              const isRunning = run.status === "running";
              const name = WORKFLOW_NAME_MAP[run.workflowId] || run.workflowId;
              const date = new Date(run.startedAt);

              return (
                <div
                  key={run.id}
                  className="bg-background/30 hover:bg-background/50 border border-border/40 rounded-lg p-2.5 flex items-center justify-between transition-colors text-xs"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-foreground font-medium truncate max-w-[120px]">
                        {name}
                      </span>
                      <span className="text-[9px] text-hint shrink-0 font-mono">
                        {run.trigger === "manual" ? "手动" : run.trigger === "auto" ? "自动" : "子流"}
                      </span>
                    </div>
                    {run.error && (
                      <p className="text-[10px] text-danger truncate mt-0.5" title={run.error}>
                        {run.error}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-hint tabular-nums">
                      {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    {isRunning ? (
                      <Loader2 className="size-3.5 text-primary animate-spin" />
                    ) : isSuccess ? (
                      <CheckCircle2 className="size-3.5 text-success" />
                    ) : (
                      <XCircle className="size-3.5 text-danger" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 历史评估摘要 */}
      {health.evolutionLogs.length > 0 && (
        <div className="border-t border-border/60 pt-3 space-y-2">
          <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
            <Zap className="size-3 text-primary" />
            最近 Harness 评估周期
          </span>
          <div className="bg-background/25 border border-border/30 rounded-lg p-2 text-[10px] space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">最后评估时间</span>
              <span className="text-foreground">
                {new Date(health.evolutionLogs[0].evaluatedAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">决策等级 / 触发升级</span>
              <span className={cn("font-medium", health.evolutionLogs[0].triggered ? "text-warning" : "text-success")}>
                {health.evolutionLogs[0].triggered ? "触发升级/降级提案" : "健康免干预"}
              </span>
            </div>
            {health.evolutionLogs[0].reason && (
              <p className="text-hint leading-relaxed mt-1 border-t border-border/20 pt-1 text-[9px] break-words">
                诊断: {health.evolutionLogs[0].reason}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

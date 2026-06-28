"use client";

import { useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Folder,
  ArrowLeft,
  Play,
  Brain,
  History,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  MessageSquare,
  Activity,
  AlertTriangle,
  Shield,
  Zap,
  Filter,
  RotateCw,
} from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { ProjectTabs } from "./_components/project-tabs";
import { ProjectRiskPanel } from "./_components/project-risk-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";

/** WorkflowRun 摘要（与 API 返回对齐） */
interface WorkflowRunBrief {
  id: string;
  runId: string;
  status: string;
  mode: string;
  triggerType: string;
  triggeredBy: string | null;
  automationLevel: string | null;
  riskLevel: string | null;
  stepCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
}

/** 自动化等级色标 — null 表示 envelopeSnapshot 缺失，标注"待评估" */
function autoLevelBadge(level: string | null) {
  if (!level) return "bg-muted/50 text-muted-foreground border-border/30";
  switch (level) {
    case "L4": return "bg-danger/10 text-danger border-danger/30";
    case "L3": return "bg-warning/10 text-warning border-warning/30";
    case "L2": return "bg-info/10 text-info border-info/20";
    case "L1": default: return "bg-accent text-muted-foreground border-border";
  }
}

/** 风险等级色标 — null 表示未评估，标注"待评估" */
function riskBadge(level: string | null) {
  if (!level) return "bg-muted/50 text-muted-foreground border-border/30";
  switch (level) {
    case "critical": return "bg-danger/15 text-danger font-bold";
    case "high": return "bg-danger/10 text-danger";
    case "medium": return "bg-warning/10 text-warning";
    case "low": default: return "bg-accent text-muted-foreground";
  }
}

/** 状态 Badge */
function StatusBadge({ status, errorMessage }: { status: string; errorMessage?: string | null }) {
  const base = "text-[10px] px-2 py-0.5 rounded-full font-medium border shrink-0";
  switch (status) {
    case "completed":
      return <span className={cn(base, "bg-success/10 text-success border-success/20")}>成功</span>;
    case "failed":
      return (
        <span
          className={cn(base, "bg-danger/10 text-danger border-danger/20 cursor-help")}
          title={errorMessage || "执行失败"}
        >
          失败
        </span>
      );
    case "running":
      return <span className={cn(base, "bg-info/10 text-info border-info/20 animate-pulse")}>运行中</span>;
    case "waiting":
      return <span className={cn(base, "bg-warning/10 text-warning border-warning/20")}>待审批</span>;
    case "cancelled":
      return <span className={cn(base, "bg-muted text-muted-foreground border-border")}>已取消</span>;
    case "pending":
      return <span className={cn(base, "bg-accent text-muted-foreground border-border")}>待执行</span>;
    default:
      return <span className={cn(base, "bg-accent text-muted-foreground border-border")}>{status}</span>;
  }
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params?.id as string;

  const [runStatusFilter, setRunStatusFilter] = useState<string | null>(null);

  // 获取项目详情（对接真实后端接口，含 workflowRuns + memories）
  const { data: detailData, isLoading, error, refetch } = useQuery({
    queryKey: ["project-detail", id],
    queryFn: async () => {
      if (!id) return null;
      return apiClient.getProject(id);
    },
    enabled: !!id,
    // running 状态的任务持续轮询
    refetchInterval: (query) => {
      const runs: WorkflowRunBrief[] = query.state.data?.workflowRuns || [];
      const hasRunning = runs.some((r: WorkflowRunBrief) => r.status === "running" || r.status === "waiting");
      return hasRunning ? 5000 : false;
    },
  });

  const project = detailData?.project;
  const projectMemories = detailData?.memories || [];
  const allWorkflowRuns: WorkflowRunBrief[] = detailData?.workflowRuns || [];

  // 过滤
  const projectWorkflowRuns = useMemo(() => {
    if (!runStatusFilter) return allWorkflowRuns;
    return allWorkflowRuns.filter((r) => r.status === runStatusFilter);
  }, [allWorkflowRuns, runStatusFilter]);

  // 统计
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of allWorkflowRuns) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    return counts;
  }, [allWorkflowRuns]);

  // 构造风险点（解析数据库，若无则兜底）
  const riskPoints = useMemo(() => {
    try {
      if (project?.riskPoints) {
        const parsed = typeof project.riskPoints === "string" ? JSON.parse(project.riskPoints) : project.riskPoints;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [
      {
        title: "项目空间已创建就绪",
        level: "low" as const,
        detail: '初始中期记忆已加载。请点击右上角「在此项目下发任务」按钮启动 AI 流程，智能分析引擎将自动进行风险评估并记录审计日志。',
      },
    ];
  }, [project]);

  const nextActions = useMemo(() => {
    try {
      if (project?.nextActions) {
        const parsed = typeof project.nextActions === "string" ? JSON.parse(project.nextActions) : project.nextActions;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [
      {
        action: '点击右上角「下发任务」跳转，输入指令派发任务。AI 智能体将自动分析并通过审批后执行。',
        priority: "urgent" as const,
      },
    ];
  }, [project]);

  // 跳转 WorkflowRun 详情
  const openRunDetail = useCallback(
    (runId: string) => {
      router.push(`/workspace/runs/${runId}`);
    },
    [router],
  );

  // 取消任务
  const handleCancelRun = useCallback(
    async (e: React.MouseEvent, runId: string) => {
      e.stopPropagation();
      if (!confirm("确认取消此任务？取消后该工作流运行将被标记为 cancelled。")) return;
      try {
        const res = await fetch(`/api/workflow-runs/${runId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "用户在项目空间手动取消" }),
        });
        if (res.ok) {
          refetch();
        } else {
          const json = await res.json().catch(() => ({}));
          alert((json as any).error || "取消失败");
        }
      } catch (err) {
        alert("网络异常，取消失败");
      }
    },
    [refetch],
  );

  // 计算 running 数量
  const runningCount = statusCounts["running"] || 0;
  const failedCount = statusCounts["failed"] || 0;

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center space-y-2">
          <Loader2 className="size-8 text-primary animate-spin mx-auto" />
          <p className="text-hint text-xs">正在加载项目空间真实上下文中...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex h-[80vh] items-center justify-center p-6">
        <div className="border border-danger/20 bg-danger/5 rounded-2xl p-8 max-w-md text-center space-y-3">
          <XCircle className="size-10 text-danger mx-auto" />
          <h4 className="text-foreground text-sm font-semibold">项目加载失败</h4>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {error instanceof Error ? error.message : "该项目不存在或无权访问其多租户空间"}
          </p>
          <Button variant="outline" onClick={() => router.push("/projects")} className="text-xs">
            <ArrowLeft className="size-3.5 mr-1" /> 返回项目列表
          </Button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
      case "processing":
        return <span className="bg-success/10 text-success text-xs px-2.5 py-0.5 rounded-full font-medium">进行中</span>;
      case "completed":
        return <span className="bg-accent text-muted-foreground text-xs px-2.5 py-0.5 rounded-full font-medium">已完成</span>;
      default:
        return <span className="bg-warning/10 text-warning text-xs px-2.5 py-0.5 rounded-full font-medium">搁置</span>;
    }
  };

  const FILTER_OPTIONS = [
    { value: null, label: "全部", count: allWorkflowRuns.length },
    { value: "running", label: "运行中", count: statusCounts["running"] || 0 },
    { value: "waiting", label: "待审批", count: statusCounts["waiting"] || 0 },
    { value: "completed", label: "已完成", count: statusCounts["completed"] || 0 },
    { value: "failed", label: "失败", count: statusCounts["failed"] || 0 },
    { value: "cancelled", label: "已取消", count: statusCounts["cancelled"] || 0 },
  ];

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-3rem)] w-full flex-col bg-background overflow-y-auto">
        <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
          {/* 顶栏面包屑与快捷跳转 */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push("/projects")}
              className="text-hint hover:text-foreground text-xs flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="size-4" />
              返回项目大盘
            </button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="h-8 text-xs gap-1 rounded-lg"
              >
                <RotateCw className="size-3" /> 刷新
              </Button>
              <Button
                onClick={() => router.push(`/agents?projectId=${project.id}`)}
                className="bg-primary hover:bg-primary/95 text-white rounded-xl px-4 py-2 flex items-center gap-1.5 h-10 shadow-md"
              >
                <Play className="size-3.5" />
                在此项目下发任务
              </Button>
            </div>
          </div>

          {/* 项目基本信息大卡片 */}
          <div className="bg-card border border-border/40 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-foreground text-xl font-bold">{project.name}</h2>
                  {getStatusBadge(project.status)}
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-3xl">
                  {project.description || "暂无项目详细描述，可在下方配置面板进行配置。"}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs md:text-right shrink-0">
                {project.country && (
                  <span className="bg-accent/40 border border-border/20 px-2.5 py-1 rounded-xl text-muted-foreground">
                    国别: {project.country}
                  </span>
                )}
                {project.relatedClient && (
                  <span className="bg-accent/40 border border-border/20 px-2.5 py-1 rounded-xl text-muted-foreground">
                    客户: {project.relatedClient}
                  </span>
                )}
              </div>
            </div>

            {/* 执行总览 */}
            <div className="flex items-center gap-4 pt-2 border-t border-border/30">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="size-3.5 text-info" />
                <span>运行中 <strong>{runningCount}</strong> 个任务</span>
              </div>
              {failedCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertTriangle className="size-3.5 text-danger" />
                  <span>失败 <strong className="text-danger">{failedCount}</strong> 个任务</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Zap className="size-3.5 text-warning" />
                <span>总任务 <strong>{allWorkflowRuns.length}</strong> 个</span>
              </div>
            </div>
          </div>

          {/* 核心双栏：左侧项目专属中期记忆 VS 右侧关联工作流运行实时追踪 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左侧：中期记忆大卡片 */}
            <div className="bg-card border border-border/40 rounded-2xl p-5 flex flex-col justify-between h-[420px] shadow-xs">
              <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between shrink-0">
                  <h3 className="text-foreground text-sm font-semibold flex items-center gap-1.5">
                    <Brain className="size-4 text-purple-400" />
                    项目级中期记忆 (最近 5 条)
                  </h3>
                  <button
                    onClick={() => router.push(`/brain?projectId=${project.id}`)}
                    className="text-primary hover:text-primary/80 text-xs flex items-center gap-0.5 font-medium transition-colors"
                  >
                    查看全部 <ExternalLink className="size-3" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                  {projectMemories.length === 0 ? (
                    <div className="py-12 text-center space-y-2">
                      <Brain className="size-8 text-hint/30 mx-auto" />
                      <p className="text-hint text-xs">暂无该项目的专属记忆沉淀</p>
                      <p className="text-hint text-[10px]">AI 执行任务后自动生成项目级中期记忆</p>
                    </div>
                  ) : (
                    projectMemories.map((mem: any) => (
                      <div
                        key={mem.id}
                        className="bg-accent/20 border border-border/20 rounded-xl p-3 space-y-1.5 hover:border-border/40 transition-colors"
                      >
                        <div className="flex justify-between items-center text-[10px]">
                          <div className="flex items-center gap-2">
                            <span className="text-hint font-light">
                              {new Date(mem.updatedAt).toLocaleDateString()}
                            </span>
                            {mem.summary && (
                              <span className="text-foreground/60 font-medium truncate max-w-[120px]">
                                {mem.summary}
                              </span>
                            )}
                          </div>
                          <span className="text-hint">v{mem.version}</span>
                        </div>
                        <p className="text-foreground text-xs leading-relaxed line-clamp-2">
                          {mem.content}
                        </p>
                        {mem.tags && mem.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {mem.tags.map((t: string) => (
                              <span key={t} className="text-[9px] bg-card text-muted-foreground px-1.5 py-0.5 rounded border border-border/10">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 右侧：工作流运行追踪 (最近10条，可筛选/可点击/可取消) */}
            <div className="bg-card border border-border/40 rounded-2xl p-5 flex flex-col justify-between h-[420px] shadow-xs">
              <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                <div className="shrink-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-foreground text-sm font-semibold flex items-center gap-1.5">
                      <History className="size-4 text-blue-400" />
                      工作流执行追踪 (最近 10 条)
                    </h3>
                    <span className="text-hint text-[10px]">
                      {runningCount > 0 ? (
                        <span className="text-info animate-pulse">● 实时轮询中</span>
                      ) : (
                        "与 /api/workflow-runs 同步"
                      )}
                    </span>
                  </div>

                  {/* 状态筛选 */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {FILTER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value ?? "all"}
                        onClick={() => setRunStatusFilter(opt.value)}
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-lg border whitespace-nowrap transition-colors",
                          runStatusFilter === opt.value
                            ? "bg-primary/10 text-primary border-primary/30 font-medium"
                            : "bg-accent/30 text-muted-foreground border-border/30 hover:border-border/50",
                        )}
                      >
                        {opt.label}
                        {opt.count > 0 && (
                          <span className="ml-1 text-[9px] opacity-70">({opt.count})</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                  {projectWorkflowRuns.length === 0 ? (
                    <div className="py-12 text-center space-y-2">
                      <Clock className="size-8 text-hint/30 mx-auto" />
                      <p className="text-hint text-xs">
                        {runStatusFilter
                          ? `暂无 "${runStatusFilter}" 状态的工作流运行`
                          : "该项目下暂无工作流运行历史"}
                      </p>
                      <p className="text-hint text-[10px]">点击右上角"下发任务"启动第一个 AI 工作流</p>
                    </div>
                  ) : (
                    projectWorkflowRuns.map((run) => (
                      <div
                        key={run.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openRunDetail(run.runId)}
                        onKeyDown={(e) => { if (e.key === "Enter") openRunDetail(run.runId); }}
                        className={cn(
                          "bg-accent/20 border border-border/20 rounded-xl p-3 cursor-pointer",
                          "hover:border-primary/30 hover:bg-accent/40 hover:shadow-sm",
                          "transition-all flex items-center justify-between gap-3 group",
                        )}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          {/* 第一行：runId + 时间 */}
                          <div className="flex items-center gap-2">
                            <span className="text-foreground text-xs font-semibold font-mono truncate max-w-[120px] group-hover:text-primary transition-colors">
                              {run.runId.slice(0, 12)}...
                            </span>
                            <span className="text-[10px] text-hint font-light">
                              {new Date(run.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          {/* 第二行：模式 + 触发 + 步骤数 */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground capitalize">
                              模式: {run.mode}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              触发: {run.triggeredBy || "system"}
                            </span>
                            {run.stepCount > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {run.stepCount} 步骤
                              </span>
                            )}
                            {run.durationMs && (
                              <span className="text-[10px] text-hint font-mono">
                                {run.durationMs >= 1000
                                  ? `${(run.durationMs / 1000).toFixed(1)}s`
                                  : `${run.durationMs}ms`}
                              </span>
                            )}
                          </div>

                          {/* 第三行：自动化 + 风险 + 失败原因 */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {run.automationLevel ? (
                              <span
                                className={cn(
                                  "text-[9px] px-1.5 py-0.5 rounded-full border font-mono font-medium",
                                  autoLevelBadge(run.automationLevel),
                                )}
                                title={`自动化等级: ${run.automationLevel}`}
                              >
                                {run.automationLevel}
                              </span>
                            ) : (
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded-full border border-dashed bg-muted/30 text-muted-foreground"
                                title="envelopeSnapshot 缺失，自动化等级待评估"
                              >
                                待评估
                              </span>
                            )}
                            {run.riskLevel && run.riskLevel !== "low" && (
                              <span
                                className={cn(
                                  "text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                                  riskBadge(run.riskLevel),
                                )}
                                title={`风险等级: ${run.riskLevel}`}
                              >
                                {run.riskLevel}
                              </span>
                            )}
                            {run.status === "failed" && run.errorMessage && (
                              <span
                                className="text-[9px] text-danger/80 truncate max-w-[160px]"
                                title={run.errorMessage}
                              >
                                {run.errorMessage}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 右侧：状态 + 取消按钮 */}
                        <div className="shrink-0 flex flex-col items-end gap-1.5">
                          <StatusBadge status={run.status} errorMessage={run.errorMessage} />
                          {(run.status === "running" || run.status === "waiting" || run.status === "pending") && (
                            <button
                              type="button"
                              onClick={(e) => handleCancelRun(e, run.runId)}
                              className="text-[9px] text-danger/60 hover:text-danger transition-colors underline underline-offset-2 opacity-0 group-hover:opacity-100"
                              title="取消此任务"
                            >
                              取消
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 风险点与下一步建议 */}
          <ProjectRiskPanel riskPoints={riskPoints} nextActions={nextActions} />

          {/* 底部多标签视图主区域（聊天、任务、文件、动态、智能体） */}
          <div className="h-[550px] border border-border/40 rounded-2xl overflow-hidden shadow-xs">
            <ProjectTabs />
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { ProjectTabs } from "./_components/project-tabs";
import { ProjectRiskPanel } from "./_components/project-risk-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  // 1. 获取项目详情（对接真实后端接口）
  const { data: detailData, isLoading, error } = useQuery({
    queryKey: ["project-detail", id],
    queryFn: async () => {
      if (!id) return null;
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error("获取项目详情失败");
      return res.json();
    },
    enabled: !!id,
  });

  const project = detailData?.project;
  const projectMemories = detailData?.memories || [];
  const projectWorkflowRuns = detailData?.workflowRuns || [];

  // 2. 构造真实的风险评估和下一步行动（解析数据库，若无则自适应业务状态进行兜底）
  const riskPoints = useMemo(() => {
    try {
      if (project?.riskPoints) {
        const parsed = typeof project.riskPoints === "string" ? JSON.parse(project.riskPoints) : project.riskPoints;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    // 默认兜底：指示用户没有分析任务
    return [
      {
        title: "项目空间已创建就绪",
        level: "low" as const,
        detail: "初始中期记忆已加载。请点击右上角“在此项目下发任务”按钮启动 AI 流程，智能分析引擎将自动进行风险评估并记录审计日志。",
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
        action: "点击右上角“下发任务”跳转，输入指令下达询盘分配或开发信生成命令。",
        priority: "urgent" as const,
      },
    ];
  }, [project]);

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

  // 映射状态中文 Badge
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

            <Button
              onClick={() => router.push(`/agents?projectId=${project.id}`)}
              className="bg-primary hover:bg-primary/95 text-white rounded-xl px-4 py-2 flex items-center gap-1.5 h-10 shadow-md"
            >
              <Play className="size-3.5" />
              在此项目下发任务
            </Button>
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

              {/* 相关标签信息 */}
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
          </div>

          {/* 核心双栏：左侧项目专属中期记忆 (最近5条) VS 右侧关联工作流运行历史 (最近10条) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左侧：中期记忆大卡片 */}
            <div className="bg-card border border-border/40 rounded-2xl p-5 flex flex-col justify-between h-[380px] shadow-xs">
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
                    <p className="text-hint text-xs py-12 text-center">暂无该项目的专属记忆沉淀</p>
                  ) : (
                    projectMemories.map((mem: any) => (
                      <div
                        key={mem.id}
                        className="bg-accent/20 border border-border/20 rounded-xl p-3 space-y-1.5"
                      >
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-hint font-light">
                            {new Date(mem.updatedAt).toLocaleDateString()}
                          </span>
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

            {/* 右侧：工作流运行追踪 (最近10条) */}
            <div className="bg-card border border-border/40 rounded-2xl p-5 flex flex-col justify-between h-[380px] shadow-xs">
              <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between shrink-0">
                  <h3 className="text-foreground text-sm font-semibold flex items-center gap-1.5">
                    <History className="size-4 text-blue-400" />
                    工作流运行状态追踪 (最近 10 条)
                  </h3>
                  <span className="text-hint text-[10px]">与 /api/workflow-runs 保持强实时同步</span>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                  {projectWorkflowRuns.length === 0 ? (
                    <div className="py-12 text-center space-y-2">
                      <Clock className="size-8 text-hint/30 mx-auto" />
                      <p className="text-hint text-xs">该项目下暂无工作流运行历史</p>
                    </div>
                  ) : (
                    projectWorkflowRuns.map((run: any) => (
                      <div
                        key={run.id}
                        className="bg-accent/20 border border-border/20 rounded-xl p-3 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-foreground text-xs font-semibold font-mono truncate max-w-[150px]">
                              {run.runId}
                            </span>
                            <span className="text-[10px] text-hint font-light">
                              {new Date(run.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground capitalize">
                            模式: {run.mode} | 触发: {run.triggeredBy || "system"}
                          </p>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          <span
                            className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full font-medium border",
                              run.status === "completed"
                                ? "bg-success/10 text-success border-success/20"
                                : run.status === "failed"
                                  ? "bg-danger/10 text-danger border-danger/20"
                                  : run.status === "running"
                                    ? "bg-info/10 text-info border-info/20 animate-pulse"
                                    : "bg-accent text-muted-foreground border-border"
                            )}
                          >
                            {run.status === "completed"
                              ? "成功"
                              : run.status === "failed"
                                ? "失败"
                                : run.status === "running"
                                  ? "运行中"
                                  : run.status}
                          </span>
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

          {/* 底部保留多标签视图主区域（聊天、任务、文件、动态、智能体） */}
          <div className="h-[550px] border border-border/40 rounded-2xl overflow-hidden shadow-xs">
            <ProjectTabs />
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

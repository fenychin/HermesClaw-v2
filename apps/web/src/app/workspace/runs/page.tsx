"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  RefreshCw,
  Activity,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface WorkflowRunItem {
  id: string;
  runId: string;
  status: string;
  triggeredBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  durationMs: number | null;
  workflowName: string;
}

export default function RunsPage() {
  const router = useRouter();

  const { data, isLoading, error, refetch, isRefetching } = useQuery<{ runs: WorkflowRunItem[] }>({
    queryKey: ["workflow-runs"],
    queryFn: async () => {
      const res = await fetch("/api/workflow-runs/list");
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 8000,
  });

  const runs = data?.runs || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
      case "SUCCESS":
        return (
          <Badge className="bg-success/10 text-success hover:bg-success/20 border-success/30 gap-1 rounded-full font-medium">
            <CheckCircle2 className="size-3" />
            已完成
          </Badge>
        );
      case "failed":
      case "FAILED":
        return (
          <Badge className="bg-danger/10 text-danger hover:bg-danger/20 border-danger/30 gap-1 rounded-full font-medium">
            <XCircle className="size-3" />
            失败
          </Badge>
        );
      case "running":
      case "RUNNING":
      case "PENDING":
        return (
          <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/30 gap-1 rounded-full font-medium animate-pulse">
            <Activity className="size-3 animate-spin shrink-0" />
            执行中
          </Badge>
        );
      case "pending_approval":
      case "PENDING_APPROVAL":
        return (
          <Badge className="bg-warning/10 text-warning hover:bg-warning/20 border-warning/30 gap-1 rounded-full font-medium animate-pulse">
            <Clock className="size-3" />
            待审批
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground gap-1 rounded-full font-medium">
            {status}
          </Badge>
        );
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "--";
    if (ms < 1000) return `${ms}ms`;
    const secs = (ms / 1000).toFixed(1);
    return `${secs}秒`;
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "刚刚";
      if (diffMins < 60) return `${diffMins}分钟前`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}小时前`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}天前`;
    } catch {
      return "未知时间";
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between mt-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            工作流运行历史
          </h1>
          <p className="text-xs text-muted-foreground">
            查看当前工作空间内所有数字员工、物理连接器及工作流的运行详情、审批状态和推理透明轨迹。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading || isRefetching}
          className="rounded-xl gap-1.5 h-9"
        >
          <RefreshCw className={`size-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </div>

      {/* 列表 */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-card/40 border border-border/40 rounded-xl p-4 flex items-center justify-between"
            >
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : runs.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16 bg-card/20 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-4"
        >
          <div className="size-12 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground">
            <Play className="size-5 text-muted-foreground/60 rotate-45" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">暂无执行历史</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              你还没有运行过任何工作流。可以去新对话主板块使用快捷入口，或 @提及 智能体并指派任务。
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => router.push("/workspace/chat")}
            className="rounded-xl gap-1.5 mt-2 bg-primary text-primary-foreground"
          >
            去开启首个任务
            <ArrowRight className="size-3.5" />
          </Button>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {runs.map((run, i) => (
            <motion.div
              key={run.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              onClick={() => router.push(`/workspace/runs/${run.runId}`)}
              className="bg-card/30 hover:bg-card/80 border border-border/50 hover:border-primary/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition-all group"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                    {run.workflowName}
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground/65 bg-muted/50 px-1.5 py-0.5 rounded border border-border/30">
                    ID: {run.runId.slice(0, 12)}...
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="size-3 text-muted-foreground/60" />
                    {run.triggeredBy || "系统触发"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3 text-muted-foreground/60" />
                    耗时: {formatDuration(run.durationMs)}
                  </span>
                  <span>{formatTime(run.createdAt)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                {getStatusBadge(run.status)}
                <ChevronRightIcon className="size-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all hidden sm:block" />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChevronRightIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

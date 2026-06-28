"use client";

import { use, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  ListTodo,
  FileSearch,
  Check,
  X,
  Play,
  RotateCw,
  FileCheck,
  Hash,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface StepItem {
  nodeId: string;
  nodeType: string;
  status: string;
  outputData: any;
  errorMessage: string | null;
}

/** 审计日志条目（真实 AuditLog 表，非 ExecutionEvent） */
interface AuditLogItem {
  auditId: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string | null;
  riskLevel: string | null;
  automationLevel: string | null;
  status: string;
  triggeredBy: string;
  timestamp: string;
  contextSnapshot: any;
}

/** 动作回执（真实 ActionReceipt 表） */
interface ActionReceiptItem {
  receiptId: string;
  receiptHash: string | null;
  taskId: string;
  connectorId: string;
  outcome: string;
  executedAt: string;
  errorCode: string | null;
  failureReason: string | null;
  retryable: boolean;
  durationMs: number | null;
  version: string;
}

interface WorkflowRunStatus {
  status: string;
  currentNodeId: string | null;
  progress: number;
  checkpointId: string | null;
  steps: StepItem[];
  errorMessage: string | null;
  completedAt: string | null;
  auditLogs: AuditLogItem[];
  actionReceipts: ActionReceiptItem[];
}

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id: runId } = use(params);

  const [deciding, setDeciding] = useState(false);

  // 1. 轮询工作流运行状态 (每 2 秒一次)
  const { data: runStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<WorkflowRunStatus>({
    queryKey: ["workflow-run-status", runId],
    queryFn: async () => {
      const res = await fetch(`/api/workflow-runs/${runId}/status`);
      if (!res.ok) throw new Error("获取运行状态失败");
      const json = await res.json();
      return json.data;
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === "completed" || data.status === "failed" || data.status === "SUCCESS" || data.status === "FAILED")) {
        return false;
      }
      return 2000;
    }
  });

  // 2. 拉取推理轨迹
  const { data: tracesData, isLoading: tracesLoading, refetch: refetchTraces } = useQuery({
    queryKey: ["reasoning-traces", runId],
    queryFn: async () => {
      const res = await fetch(`/api/reasoning-traces?workflowRunId=${runId}`);
      if (!res.ok) throw new Error("获取推理轨迹失败");
      const json = await res.json();
      return json.data;
    },
    refetchInterval: (query) => {
      if (runStatus && (runStatus.status === "completed" || runStatus.status === "failed" || runStatus.status === "SUCCESS" || runStatus.status === "FAILED")) {
        return false;
      }
      return 3000;
    }
  });

  // 决策处理 (批准/拒绝高危门禁)
  const handleDecide = async (decision: "approved" | "rejected") => {
    const cpId = runStatus?.checkpointId;
    if (!cpId) return;

    setDeciding(true);
    const toastId = toast.loading(decision === "approved" ? "正在批准物理执行..." : "正在拒绝并中断任务...");
    try {
      const res = await fetch(`/api/approvals/${cpId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, confirm: true })
      });

      const data = await res.json();
      toast.dismiss(toastId);
      if (data.success) {
        toast.success(decision === "approved" ? "审批通过，工作流已恢复物理执行" : "已成功拒绝，任务已安全阻断");
        queryClient.invalidateQueries({ queryKey: ["workflow-run-status", runId] });
        refetchStatus();
      } else {
        toast.error(data.message || "决策提交失败");
      }
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("网络异常，提交决策失败");
    } finally {
      setDeciding(false);
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case "completed":
      case "SUCCESS":
        return { text: "已完成", color: "text-success", bg: "bg-success/10", border: "border-success/20" };
      case "failed":
      case "FAILED":
        return { text: "执行失败", color: "text-danger", bg: "bg-danger/10", border: "border-danger/20" };
      case "running":
      case "RUNNING":
      case "PENDING":
        return { text: "执行中", color: "text-primary", bg: "bg-primary/10", border: "border-primary/20" };
      case "waiting":
      case "pending_approval":
      case "PENDING_APPROVAL":
        return { text: "安全门禁待审批", color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" };
      default:
        return { text: status || "未知", color: "text-muted-foreground", bg: "bg-muted", border: "border-border" };
    }
  };

  const statusMeta = getStatusText(runStatus?.status);

  // 整理所有的推理步骤 (从所有 trace 中合并)
  const reasoningSteps = useMemo(() => {
    if (!tracesData?.traces) return [];
    const sorted = [...tracesData.traces].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return sorted.flatMap((t: any) => t.steps || []);
  }, [tracesData?.traces]);

  if (statusLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-6">
        <div className="flex items-center gap-2">
          <ChevronLeft className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">返回</span>
        </div>
        <div className="space-y-4">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-4 w-72 bg-muted animate-pulse rounded" />
          <div className="h-2 w-full bg-muted animate-pulse rounded" />
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="h-60 bg-muted/40 animate-pulse rounded-xl" />
            <div className="h-60 bg-muted/40 animate-pulse rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 space-y-6">
      {/* 头部面包屑与返回 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/workspace/runs")}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer group"
        >
          <ChevronLeft className="size-3.5 group-hover:-translate-x-0.5 transition-transform" />
          返回运行历史
        </button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              refetchStatus();
              refetchTraces();
            }}
            className="h-8 text-[11px] gap-1 rounded-lg"
          >
            <RotateCw className="size-3" /> 刷新状态
          </Button>
        </div>
      </div>

      {/* 状态看板栏 */}
      <div className="bg-card/40 border border-border/50 rounded-xl p-5 space-y-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <h1 className="text-base font-semibold text-foreground">
                任务运行 ID: {runId.slice(0, 16)}...
              </h1>
              <Badge className={`${statusMeta.bg} ${statusMeta.color} ${statusMeta.border} rounded-full border px-2 py-0.5 text-[10px] font-medium`}>
                {statusMeta.text}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              任务状态：{runStatus?.status || "未知"} | 进度: {runStatus?.progress || 0}%
            </p>
          </div>
          <div className="w-full sm:w-48 space-y-1 shrink-0">
            <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
              <span>处理进度</span>
              <span>{runStatus?.progress || 0}%</span>
            </div>
            <Progress value={runStatus?.progress || 0} className="h-1.5 rounded-full" />
          </div>
        </div>

        {/* 异常错误信息提示 */}
        {runStatus?.errorMessage && (
          <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-xs text-danger flex items-start gap-2">
            <XCircle className="size-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold">运行出错回执:</span>
              <p className="font-mono text-[10px] break-all leading-relaxed">{runStatus.errorMessage}</p>
            </div>
          </div>
        )}

        {/* 高危审批栏 */}
        {runStatus?.checkpointId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 bg-warning/10 border border-warning/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="flex gap-2.5 items-start">
              <ShieldAlert className="size-5 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <span className="font-semibold text-warning">高危写动作安全审查门禁</span>
                <p className="text-muted-foreground leading-relaxed">
                  此任务执行了包含发信、修改数据或敏感写操作，已触发生动审批拦截护栏。继续执行将物理发信或写回外部系统。
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end md:self-auto">
              <Button
                variant="ghost"
                size="sm"
                disabled={deciding}
                onClick={() => handleDecide("rejected")}
                className="h-8 text-xs text-danger hover:bg-danger/10 rounded-lg"
              >
                <X className="size-3.5 mr-1" />
                安全中止
              </Button>
              <Button
                size="sm"
                disabled={deciding}
                onClick={() => handleDecide("approved")}
                className="h-8 text-xs bg-warning hover:bg-warning/90 text-black font-semibold rounded-lg shadow-md"
              >
                <Check className="size-3.5 mr-1" />
                批准运行
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 左侧：推理轨迹流 */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center gap-1.5 px-1">
            <FileSearch className="size-4 text-primary" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              今日 AI 推理透明轨迹 (Observation)
            </h2>
          </div>

          <div className="bg-card/20 border border-border/40 rounded-xl p-5 space-y-6">
            {reasoningSteps.length === 0 ? (
              <div className="text-center py-12 text-xs text-muted-foreground">
                {tracesLoading ? "正在拉取推理轨迹..." : "暂无 AI 推理轨迹数据。"}
              </div>
            ) : (
              <div className="relative pl-4 border-l border-border/50 space-y-6">
                {reasoningSteps.map((step: any, idx: number) => {
                  const isError = step.status === "failed" || step.status === "error";
                  const isRunning = step.status === "running";

                  return (
                    <div key={idx} className="relative space-y-2">
                      <span className={`absolute -left-[21px] top-1.5 size-2.5 rounded-full border bg-background flex items-center justify-center shrink-0 ${
                        isError ? "border-danger text-danger bg-danger/10" :
                        isRunning ? "border-primary bg-primary animate-ping" :
                        "border-success bg-success"
                      }`} />

                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">{step.name || `思考步骤 ${idx + 1}`}</span>
                        {step.durationMs && (
                          <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                            {step.durationMs}ms
                          </span>
                        )}
                      </div>

                      {step.thought && (
                        <p className="text-[11px] text-muted-foreground leading-relaxed bg-muted/20 border border-border/30 rounded-lg p-2.5 whitespace-pre-wrap font-mono">
                          {step.thought}
                        </p>
                      )}

                      {step.action && (
                        <div className="text-[10px] text-primary/80 bg-primary/5 rounded px-2.5 py-1.5 border border-primary/10 font-mono">
                          <span className="font-semibold">Action: </span> {step.action}
                        </div>
                      )}

                      {step.output && (
                        <div className="text-[10px] text-success/80 bg-success/5 rounded px-2.5 py-1.5 border border-success/10 font-mono overflow-x-auto">
                          <span className="font-semibold">Output: </span> {typeof step.output === "string" ? step.output : JSON.stringify(step.output)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：步骤 + 回执 + 审计 */}
        <div className="space-y-6">
          {/* 1. 步骤列表 */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 px-1">
              <ListTodo className="size-4 text-muted-foreground" />
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                物理节点执行步骤
              </h2>
            </div>

            <div className="bg-card/20 border border-border/40 rounded-xl p-4 space-y-3">
              {runStatus?.steps.map((step) => (
                <div
                  key={step.nodeId}
                  className="flex items-center justify-between p-2.5 bg-muted/10 border border-border/30 rounded-lg text-xs"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="font-medium text-foreground truncate">{step.nodeId}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{step.nodeType}</div>
                  </div>
                  {step.status === "completed" || step.status === "SUCCESS" ? (
                    <CheckCircle2 className="size-4 text-success shrink-0" />
                  ) : step.status === "failed" || step.status === "FAILED" ? (
                    <XCircle className="size-4 text-danger shrink-0" />
                  ) : step.status === "running" || step.status === "RUNNING" ? (
                    <Activity className="size-4 text-primary animate-spin shrink-0" />
                  ) : (
                    <Clock className="size-4 text-muted-foreground/60 shrink-0" />
                  )}
                </div>
              ))}

              {(!runStatus?.steps || runStatus.steps.length === 0) && (
                <div className="text-center py-6 text-[10px] text-muted-foreground">
                  暂无节点执行历史
                </div>
              )}
            </div>
          </div>

          {/* 2. 动作回执（ActionReceipt —— 真实外部执行证据） */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 px-1">
              <FileCheck className="size-4 text-success" />
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                外部执行回执 ({runStatus?.actionReceipts?.length || 0})
              </h2>
            </div>

            <div className="bg-card/20 border border-border/40 rounded-xl p-4 space-y-3">
              {runStatus?.actionReceipts && runStatus.actionReceipts.length > 0 ? (
                runStatus.actionReceipts.map((receipt) => (
                  <div
                    key={receipt.receiptId}
                    className={cn(
                      "p-2.5 rounded-lg text-xs space-y-1.5",
                      receipt.outcome === "success"
                        ? "bg-success/5 border border-success/20"
                        : "bg-danger/5 border border-danger/20",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {receipt.outcome === "success" ? (
                          <CheckCircle2 className="size-3.5 text-success shrink-0" />
                        ) : (
                          <AlertTriangle className="size-3.5 text-danger shrink-0" />
                        )}
                        <span className="font-semibold text-foreground truncate">
                          {receipt.connectorId}
                        </span>
                      </div>
                      <span className="text-[9px] text-muted-foreground font-mono shrink-0">
                        {new Date(receipt.executedAt).toLocaleTimeString()}
                      </span>
                    </div>

                    {/* 回执哈希（不可篡改证据） */}
                    {receipt.receiptHash && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                        <Hash className="size-2.5" />
                        <span className="truncate">{receipt.receiptHash.slice(0, 32)}...</span>
                      </div>
                    )}

                    {/* 失败原因 */}
                    {receipt.failureReason && (
                      <p className="text-[10px] text-danger/80 leading-relaxed">
                        {receipt.failureReason}
                      </p>
                    )}

                    {/* 元数据 */}
                    <div className="flex items-center gap-2 text-[9px] text-hint">
                      <span>task: {receipt.taskId.slice(0, 8)}...</span>
                      {receipt.durationMs != null && (
                        <span>{receipt.durationMs}ms</span>
                      )}
                      {receipt.retryable && (
                        <span className="bg-info/10 text-info px-1 py-0.5 rounded">可重试</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-[10px] text-muted-foreground">
                  暂无外部执行回执
                  <p className="text-hint mt-1">外部连接器执行后自动生成 ActionReceipt</p>
                </div>
              )}
            </div>
          </div>

          {/* 3. 最近 5 条审计日志（真实 AuditLog） */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 px-1">
              <Activity className="size-4 text-muted-foreground" />
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                最近审计日志 (AuditLog)
              </h2>
            </div>

            <div className="bg-card/20 border border-border/40 rounded-xl p-4 space-y-3">
              {runStatus?.auditLogs && runStatus.auditLogs.length > 0 ? (
                runStatus.auditLogs.map((log) => (
                  <div key={log.auditId} className="space-y-1 text-xs border-b border-border/20 last:border-0 pb-2 last:pb-0">
                    <div className="flex justify-between items-center text-[10px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-foreground truncate">{log.action}</span>
                        <span className={cn(
                          "text-[9px] px-1 py-0.5 rounded-full border",
                          log.status === "success" ? "bg-success/10 text-success border-success/20" :
                          log.status === "failed" ? "bg-danger/10 text-danger border-danger/20" :
                          "bg-accent text-muted-foreground border-border",
                        )}>
                          {log.status}
                        </span>
                      </div>
                      <span className="text-hint font-mono shrink-0 ml-2">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-hint">
                      <span>操作者: {log.actor}</span>
                      {log.riskLevel && (
                        <span className={cn(
                          "px-1 py-0.5 rounded",
                          log.riskLevel === "high" && "text-danger bg-danger/10",
                          log.riskLevel === "medium" && "text-warning bg-warning/10",
                        )}>
                          {log.riskLevel}
                        </span>
                      )}
                      {log.automationLevel && (
                        <span className="font-mono">{log.automationLevel}</span>
                      )}
                    </div>
                    {log.detail && (
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        {log.detail}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-[10px] text-muted-foreground">
                  暂无审计记录
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

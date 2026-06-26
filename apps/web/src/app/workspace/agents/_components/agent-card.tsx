"use client";

import Link from "next/link";
import { useState, useEffect, useRef, memo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { AutomationLevelBadge } from "@/components/common/agent-status-badge";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import { Play, Loader2, CheckCircle2, AlertCircle, XCircle, Ban, Clock } from "lucide-react";

interface AgentCardProps {
  id: string;
  name: string;
  role: string;
  status: "active" | "idle" | "error";
  tags: string[];
  taskCount: number;
  isBuiltIn: boolean;
  /** 自动化授权等级（AGENTS.md §4.7） */
  automationLevel?: string;
  isExpanded?: boolean;
  onToggleExpand?: (id: string) => void;
}

interface WorkflowRunStatus {
  status: string;
  currentNodeId: string | null;
  progress: number;
  errorMessage: string | null;
  completedAt: string | null;
  executionEvents: Array<{
    eventId: string;
    eventType: string;
    status: string;
    timestamp: string;
    payload?: { detail?: string };
  }>;
}

interface HistoryRunItem {
  id: string;
  runId: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

function formatTimeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "刚刚";
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return new Date(dateStr).toLocaleDateString();
}

function formatDuration(durationMs: number | null, startedAt: string | null, completedAt: string | null) {
  if (durationMs) return `${(durationMs / 1000).toFixed(1)}秒`;
  if (startedAt && completedAt) {
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    return `${(ms / 1000).toFixed(1)}秒`;
  }
  return "-";
}

export const AgentCard = memo(function AgentCard({
  id,
  name,
  role,
  status,
  tags,
  taskCount,
  isBuiltIn,
  automationLevel = "L2",
  isExpanded = false,
  onToggleExpand,
}: AgentCardProps) {
  const sseState = useUiStore((s) => s.agentExecutionStates[id]);
  const sseStatus = sseState?.status;

  const displayStatus: "active" | "idle" | "error" =
    sseStatus === "executing"
      ? "active"
      : sseStatus === "failed"
        ? "error"
        : sseStatus === "succeeded"
          ? "idle"
          : status;

  const sseColor =
    sseStatus === "executing"
      ? "text-warning"
      : sseStatus === "failed"
        ? "text-danger"
        : sseStatus === "succeeded"
          ? "text-success"
          : undefined;

  const initial = name.charAt(0).toUpperCase();

  // --- 展开面板内部状态管理 ---
  const [taskInput, setTaskInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<WorkflowRunStatus | null>(null);
  const [historyRuns, setHistoryRuns] = useState<HistoryRunItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const isPollingRef = useRef(false);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);

  // 获取历史任务记录
  const fetchHistoryRuns = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/workflow-runs?agentId=${id}&limit=10`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setHistoryRuns(json.data || []);
        }
      }
    } catch (err) {
      console.error("加载历史任务失败", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // 取消轮询状态
  const stopPolling = () => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
    isPollingRef.current = false;
  };

  // 轮询运行状态
  const startPollingStatus = (runId: string) => {
    stopPolling();
    isPollingRef.current = false;

    const poll = async () => {
      // 门禁锁防并发
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const res = await fetch(`/api/workflow-runs/${runId}/status`);
        if (!res.ok) throw new Error("获取运行状态失败");
        const json = await res.json();
        if (json.success) {
          const data = json.data as WorkflowRunStatus;
          setRunStatus(data);

          // 当到达终态时，立即清除定时器
          if (["completed", "failed", "cancelled"].includes(data.status)) {
            stopPolling();
            fetchHistoryRuns(); // 刷新历史任务
            if (data.status === "completed") {
              toast.success("任务已成功执行完成！");
            } else if (data.status === "failed") {
              toast.error(`任务执行失败: ${data.errorMessage || "未知错误"}`);
            } else {
              toast.info("任务已被用户取消。");
            }
          }
        }
      } catch (err) {
        console.error("轮询异常:", err);
      } finally {
        isPollingRef.current = false;
      }
    };

    // 立即执行一次并开启 3 秒定时器
    poll();
    intervalIdRef.current = setInterval(poll, 3000);
  };

  // 切换展开时拉取历史
  useEffect(() => {
    if (isExpanded) {
      fetchHistoryRuns();
    } else {
      stopPolling();
      setActiveRunId(null);
      setRunStatus(null);
    }
    return () => stopPolling();
  }, [isExpanded]);

  // 组件卸载时释放 intervalIdRef
  useEffect(() => {
    return () => stopPolling();
  }, []);

  // 下发任务
  const handleDispatch = async () => {
    if (!taskInput.trim()) {
      toast.error("请输入您的业务目标");
      return;
    }
    setIsSubmitting(true);
    const idempotencyKey = `${id}-${Date.now()}`;

    try {
      const res = await fetch("/api/workflow-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: id,
          input: taskInput,
          idempotencyKey,
        }),
      });

      if (!res.ok) {
        throw new Error("下发任务接口请求失败");
      }

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "任务下发失败");
      }

      const { status: runStatusStr, workflowRunId, checkpointId } = json.data;

      if (runStatusStr === "pending_approval") {
        toast.warning("高风险操作需要审批，已自动创建审批请求！即将跳转...", {
          duration: 3000,
        });
        setTimeout(() => {
          window.location.href = `/approvals`;
        }, 1500);
      } else if (runStatusStr === "running") {
        toast.success(`任务已成功下发！ID: ${workflowRunId}`);
        setTaskInput("");
        setActiveRunId(workflowRunId);
        startPollingStatus(workflowRunId);
      }
    } catch (err: any) {
      toast.error(err.message || "任务下发过程中发生错误");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 取消工作流运行
  const handleCancelRun = async (runId: string) => {
    const reason = "用户在智能体卡片中手动取消";
    try {
      const res = await fetch(`/api/workflow-runs/${runId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        toast.success("已发送取消指令");
        if (runId === activeRunId) {
          stopPolling();
          if (runStatus) {
            setRunStatus({ ...runStatus, status: "cancelled" });
          }
        }
        fetchHistoryRuns();
      } else {
        toast.error("取消任务失败");
      }
    } catch (err) {
      toast.error("网络异常，取消操作失败");
    }
  };

  return (
    <div
      onClick={() => onToggleExpand?.(id)}
      className={cn(
        "bg-card rounded-2xl border border-border p-5 hover:border-primary/40 transition-all flex flex-col gap-4 group cursor-pointer",
        isExpanded && "border-primary/60 ring-1 ring-primary/20"
      )}
    >
      {/* 顶部：头像 + 基础信息 + 状态 */}
      <div className="flex justify-between items-start gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative flex-shrink-0">
            <div
              className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold",
                "bg-accent text-accent-foreground",
              )}
            >
              {initial}
            </div>
            {sseStatus && sseStatus !== "idle" && (
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 flex size-3.5 rounded-full border-2 border-card",
                  sseStatus === "executing" && "bg-warning",
                  sseStatus === "succeeded" && "bg-success",
                  sseStatus === "failed" && "bg-danger",
                  sseStatus === "cancelled" && "bg-muted-foreground",
                )}
              >
                {sseStatus === "executing" && (
                  <span className="absolute inset-0 rounded-full animate-ping bg-warning opacity-75" />
                )}
              </span>
            )}
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-foreground font-medium text-sm hover:text-primary transition-colors truncate">
                {name}
              </span>
              {isBuiltIn && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md leading-none shrink-0">
                  官方
                </span>
              )}
              <AutomationLevelBadge level={automationLevel} />
            </div>
            <span className="text-muted-foreground text-xs mt-0.5 truncate">{role}</span>
          </div>
        </div>

        <StatusBadge status={displayStatus === "active" ? "running" : displayStatus} />
      </div>

      {sseState?.currentTask && (
        <div className={cn("-mt-2 text-xs truncate", sseColor)}>
          {sseState.currentTask}
        </div>
      )}

      {/* 中部：技能标签 */}
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="bg-muted/50 text-muted-foreground rounded-lg px-2 py-0.5 text-xs"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* 底部：任务数 + 操作 */}
      <div className="flex items-end justify-between mt-auto pt-2">
        <div className="text-hint text-xs">
          已完成 {taskCount} 项任务
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Link href={`/workspace/agents/${id}`}>
            <Button
              variant="outline"
              size="sm"
              className="bg-card border-border h-8 text-xs"
            >
              详情
            </Button>
          </Link>
          <Link href={`/workspace/chat?agent=${id}`}>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
            >
              对话
            </Button>
          </Link>
        </div>
      </div>

      {/* 展开部分：任务下发、状态监控和历史任务列表 */}
      {isExpanded && (
        <div
          className="border-t border-border/60 pt-4 mt-2 flex flex-col gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. 下发任务面板 */}
          {!activeRunId && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-foreground/80">
                下发新任务
              </label>
              <textarea
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                placeholder="请输入您的业务目标，例如：「本周跟进所有高价值询盘」"
                className="w-full min-h-[80px] p-3 text-xs bg-muted/30 border border-border rounded-xl focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all outline-none resize-none"
                disabled={isSubmitting}
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleDispatch}
                  disabled={isSubmitting || !taskInput.trim()}
                  className="h-8 text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      正在解析意图...
                    </>
                  ) : (
                    <>
                      <Play className="size-3" fill="currentColor" />
                      下发任务
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* 2. 状态监控面板 */}
          {activeRunId && runStatus && (
            <div className="bg-muted/20 border border-border/50 rounded-xl p-3.5 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  任务实时监控
                  {["completed", "failed", "cancelled"].includes(runStatus.status) ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground leading-none font-normal">
                      已结束
                    </span>
                  ) : (
                    <span className="flex size-2 rounded-full bg-blue-500 animate-pulse" />
                  )}
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  ID: {activeRunId}
                </span>
              </div>

              {/* 进度条 */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>当前执行: {runStatus.currentNodeId || "准备中"}</span>
                  <span className="font-semibold">{runStatus.progress}%</span>
                </div>
                <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300 bg-gradient-to-r from-blue-500 to-indigo-500",
                      runStatus.status === "running" && "animate-pulse"
                    )}
                    style={{ width: `${runStatus.progress}%` }}
                  />
                </div>
              </div>

              {/* 最近 5 条 ExecutionEvent 列表 */}
              <div className="flex flex-col gap-2 border-t border-border/40 pt-2.5">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  最近执行日志
                </span>
                {runStatus.executionEvents && runStatus.executionEvents.length > 0 ? (
                  <div className="flex flex-col gap-2 max-h-[120px] overflow-y-auto">
                    {runStatus.executionEvents.map((evt) => (
                      <div
                        key={evt.eventId}
                        className="flex items-start gap-2 text-[10px] leading-relaxed"
                      >
                        {evt.status === "success" || evt.status === "completed" ? (
                          <CheckCircle2 className="size-3.5 text-success shrink-0 mt-0.5" />
                        ) : evt.status === "failed" ? (
                          <XCircle className="size-3.5 text-danger shrink-0 mt-0.5" />
                        ) : (
                          <Loader2 className="size-3.5 text-primary animate-spin shrink-0 mt-0.5" />
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="text-foreground font-medium truncate">
                            {evt.eventType} - {evt.payload?.detail || "执行中"}
                          </span>
                          <span className="text-hint text-[9px]">
                            {formatTimeAgo(evt.timestamp)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-[10px] text-hint italic">暂无执行事件...</span>
                )}
              </div>

              {/* 控制与终态展示 */}
              <div className="flex justify-between items-center border-t border-border/40 pt-2.5">
                <span className="text-[10px] text-hint">
                  {runStatus.completedAt && (
                    <>完成时间: {new Date(runStatus.completedAt).toLocaleTimeString()}</>
                  )}
                </span>
                {!["completed", "failed", "cancelled"].includes(runStatus.status) ? (
                  <Button
                    onClick={() => handleCancelRun(activeRunId)}
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] text-danger hover:bg-danger/10 px-2 rounded"
                  >
                    取消执行
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      setActiveRunId(null);
                      setRunStatus(null);
                    }}
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] hover:bg-muted px-2 rounded"
                  >
                    返回下发
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 3. 历史任务列表 */}
          <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
            <span className="text-xs font-semibold text-foreground/80 flex items-center gap-1">
              <Clock className="size-3.5" />
              历史任务流 (近10条)
            </span>

            {isLoadingHistory ? (
              <div className="flex items-center justify-center py-4 text-xs text-hint gap-1.5">
                <Loader2 className="size-3.5 animate-spin" />
                正在加载历史任务...
              </div>
            ) : historyRuns && historyRuns.length > 0 ? (
              <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto pr-1">
                {historyRuns.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/40 text-[10px] hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "size-2 rounded-full shrink-0",
                          run.status === "completed" && "bg-success",
                          run.status === "failed" && "bg-danger",
                          run.status === "cancelled" && "bg-muted-foreground",
                          run.status === "running" && "bg-blue-500 animate-pulse"
                        )}
                      />
                      <span className="font-mono text-foreground/90 select-all truncate">
                        {run.runId}
                      </span>
                      <span className="text-hint">
                        {formatTimeAgo(run.createdAt)}
                      </span>
                      <span className="text-hint font-medium">
                        (耗时: {formatDuration(run.durationMs, run.startedAt, run.completedAt)})
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {run.status === "running" ? (
                        <Button
                          onClick={() => handleCancelRun(run.runId)}
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[9px] text-danger hover:bg-danger/10 px-1.5 rounded"
                        >
                          取消
                        </Button>
                      ) : (
                        <span className="text-hint text-[9px]">
                          {run.status === "completed"
                            ? "已完成"
                            : run.status === "failed"
                              ? "失败"
                              : "已取消"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-hint italic py-2">暂无历史执行记录</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});


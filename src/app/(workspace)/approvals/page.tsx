"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { 
  ClipboardCheck, 
  Clock, 
  Activity, 
  ArrowRight, 
  AlertCircle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  RefreshCw,
  User,
  Shield,
  ExternalLink
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { cn } from "@/lib/utils";
import type { HarnessProposal } from "@/contracts/harness-proposal";
import { useCurrentWorkspaceRole } from "@/hooks/use-workspace-role";
import { useWorkspaceData } from "@/hooks/use-workspace";

export interface ApprovalCheckpoint {
  id: string; // 实际是 checkpointId
  checkpointId: string;
  taskId?: string;
  workflowRunId?: string;
  proposalId?: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  automationLevel: string;
  actionType: string;
  actionSummary: string;
  status: "pending" | "approved" | "rejected" | "expired" | "auto-approved";
  createdAt: string;
  expiresAt: string;
  requestedBy: string;
  remainingMs: number;
}

export default function ApprovalsPage() {
  const [activeCategory, setActiveCategory] = useState<"proposals" | "checkpoints">("proposals");
  
  // Proposals 状态 (保留原有升级提案的真实对接)
  const [proposals, setProposals] = useState<HarnessProposal[]>([]);
  const [proposalFilter, setProposalFilter] = useState<"all" | "draft" | "canary">("all");
  const [isProposalsLoading, setIsProposalsLoading] = useState(true);

  // Checkpoints 状态 (重构拦截审批)
  const [checkpoints, setCheckpoints] = useState<ApprovalCheckpoint[]>([]);
  const [checkpointFilter, setCheckpointFilter] = useState<string>("pending");
  const [isCheckpointsLoading, setIsCheckpointsLoading] = useState(false);
  const [isDeciding, setIsDeciding] = useState<string | null>(null);
  const [hasFetchError, setHasFetchError] = useState(false);

  // 展开卡片状态
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 复制状态记录
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // 拒绝理由填写状态
  const [activeRejectId, setActiveRejectId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState<string>("");

  // 获取当前工作区角色和配置
  const { isAdmin } = useCurrentWorkspaceRole();
  const { workspace } = useWorkspaceData();

  // 加载 Proposals (升级提案)
  const fetchProposals = useCallback((silent = false) => {
    if (!silent) setIsProposalsLoading(true);
    fetch("/api/proposals")
      .then((res) => {
        if (!res.ok) throw new Error("加载提案失败");
        return res.json();
      })
      .then((data) => {
        setProposals(data.proposals || []);
        setIsProposalsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load proposals:", err);
        setIsProposalsLoading(false);
      });
  }, []);

  // 加载 Checkpoints (高危动作拦截)
  const fetchCheckpoints = useCallback((status: string, silent = false) => {
    if (!silent) {
      setIsCheckpointsLoading(true);
      setHasFetchError(false);
    }
    fetch(`/api/approvals?status=${status}&page=1&limit=50`)
      .then((res) => {
        if (!res.ok) throw new Error("加载任务拦截列表失败");
        return res.json();
      })
      .then((resData) => {
        // 后端返回的是 { success: true, data: { checkpoints: [...], total } }
        setCheckpoints(resData.data?.checkpoints || []);
        setIsCheckpointsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load checkpoints:", err);
        setIsCheckpointsLoading(false);
        if (!silent) setHasFetchError(true);
      });
  }, []);

  // 页面初始化加载
  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  useEffect(() => {
    if (activeCategory === "checkpoints") {
      fetchCheckpoints(checkpointFilter);
    }
  }, [activeCategory, checkpointFilter, fetchCheckpoints]);

  // 30秒轮询更新 (无 loading 静默刷新)
  useEffect(() => {
    const pollTimer = setInterval(() => {
      if (activeCategory === "proposals") {
        fetchProposals(true);
      } else {
        fetchCheckpoints(checkpointFilter, true);
      }
    }, 30000);
    return () => clearInterval(pollTimer);
  }, [activeCategory, checkpointFilter, fetchProposals, fetchCheckpoints]);

  // 客户端倒计时逻辑
  useEffect(() => {
    const timer = setInterval(() => {
      setCheckpoints((prevList) =>
        prevList.map((cp) => {
          if (cp.status === "pending" && cp.remainingMs > 0) {
            const nextRemaining = cp.remainingMs - 1000;
            // 倒计时归零时将其设为已过期，以便 UI 自行调整
            return {
              ...cp,
              remainingMs: Math.max(0, nextRemaining),
              status: nextRemaining <= 0 ? "expired" : cp.status,
            };
          }
          return cp;
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 决策审批接口对接与乐观更新
  const handleDecideCheckpoint = async (id: string, decision: "approved" | "rejected", comment?: string) => {
    setIsDeciding(id);
    const toastId = toast.loading("正在提交审批决策...");

    // 保存当前快照以备回滚
    const originalCheckpoints = [...checkpoints];

    // 乐观更新：本地立即将该条拦截记录的 status 修改
    setCheckpoints((prev) =>
      prev.map((cp) => (cp.id === id ? { ...cp, status: decision } : cp))
    );

    try {
      const res = await fetch(`/api/approvals/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment }),
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "决策提交失败");
      }
      toast.success(
        decision === "approved"
          ? "批准成功！任务已恢复并进入放行链路"
          : "已成功拒绝该高危拦截动作",
        { id: toastId }
      );
      // 清空输入框和选择项
      setActiveRejectId(null);
      setRejectComment("");
      // 成功后刷一次最新数据以保持一致性
      fetchCheckpoints(checkpointFilter, true);
    } catch (err: any) {
      // 失败回滚快照
      setCheckpoints(originalCheckpoints);
      toast.error(`决策提交失败: ${err.message}`, { id: toastId });
    } finally {
      setIsDeciding(null);
    }
  };

  // 复制文字辅助
  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(`${label}-${text}`);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 格式化倒计时文本 (HH:MM:SS)
  const formatCountdown = (ms: number) => {
    if (ms <= 0) return "已超时";
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  // 过滤提案升级列表
  const filteredProposals = proposals.filter((p) => {
    const isApprovalState = p.status === "draft" || p.status === "canary";
    if (!isApprovalState) return false;
    
    if (proposalFilter === "all") return true;
    return p.status === proposalFilter;
  });

  return (
    <PageTransition>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <PageHeader 
            title="审批中心" 
            description="系统升级提案与运行时高危任务拦截决策面板"
          />
          {/* L1/L2 自动化等级显示 */}
          {workspace && (
            <div className="self-start md:self-auto flex items-center gap-2.5 bg-card/60 border border-border/60 rounded-xl px-4 py-2 text-xs font-semibold text-foreground backdrop-blur-sm shadow-sm">
              <Shield className="size-4 text-primary animate-pulse" />
              <span>自动授权最高等级：</span>
              <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-bold">
                {workspace.automationLevel || "L2"}
              </span>
            </div>
          )}
        </div>

        {/* 分类 Tabs */}
        <div className="flex gap-6 border-b border-border/60 pb-1 text-sm font-semibold">
          <button
            onClick={() => setActiveCategory("proposals")}
            className={cn(
              "pb-2.5 border-b-2 px-1 transition-all",
              activeCategory === "proposals"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Harness 升级提案
          </button>
          <button
            onClick={() => setActiveCategory("checkpoints")}
            className={cn(
              "pb-2.5 border-b-2 px-1 transition-all flex items-center gap-1.5",
              activeCategory === "checkpoints"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            任务拦截审批 (L3/L4)
            {checkpoints.filter(c => c.status === "pending").length > 0 && (
              <span className="inline-flex items-center justify-center size-5 rounded-full bg-danger/20 text-danger text-xs font-bold animate-pulse">
                {checkpoints.filter(c => c.status === "pending").length}
              </span>
            )}
          </button>
        </div>

        {/* Harness 升级提案面板 */}
        {activeCategory === "proposals" ? (
          <>
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <button
                onClick={() => setProposalFilter("all")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                  proposalFilter === "all" 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "text-muted-foreground hover:bg-accent/40"
                )}
              >
                全部待办 ({proposals.filter(p => p.status === "draft" || p.status === "canary").length})
              </button>
              <button
                onClick={() => setProposalFilter("draft")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                  proposalFilter === "draft" 
                    ? "bg-warning/20 text-warning border border-warning/30" 
                    : "text-muted-foreground hover:bg-accent/40"
                )}
              >
                待审批 ({proposals.filter(p => p.status === "draft").length})
              </button>
              <button
                onClick={() => setProposalFilter("canary")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                  proposalFilter === "canary" 
                    ? "bg-info/20 text-info border border-info/30" 
                    : "text-muted-foreground hover:bg-accent/40"
                )}
              >
                灰度中 ({proposals.filter(p => p.status === "canary").length})
              </button>
            </div>

            {isProposalsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-44 bg-accent/30 rounded-xl animate-pulse border border-border/40" />
                ))}
              </div>
            ) : filteredProposals.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-2xl bg-card/10 text-center">
                <ClipboardCheck className="size-10 text-muted-foreground opacity-50 mb-3" />
                <h3 className="text-sm font-semibold text-foreground">暂无待审批提案</h3>
                <p className="text-xs text-muted-foreground mt-1">当前工作区所有智能体边界与配置运行状况良好</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredProposals.map((proposal) => {
                  const isDraft = proposal.status === "draft";
                  return (
                    <div 
                      key={proposal.id}
                      className={cn(
                        "bg-card/40 border border-border backdrop-blur-md rounded-xl p-5",
                        "hover:border-primary/30 hover:shadow-md transition-all duration-200",
                        "flex flex-col justify-between space-y-4"
                      )}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold text-muted-foreground">
                            {proposal.proposalId}
                          </span>
                          <span className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full font-semibold border",
                            isDraft 
                              ? "bg-warning/10 text-warning border-warning/20" 
                              : "bg-info/10 text-info border-info/20"
                          )}>
                            {isDraft ? "待审批" : "灰度中 (Canary)"}
                          </span>
                        </div>

                        <div>
                          <h4 className="text-foreground text-sm font-semibold line-clamp-1">
                            {proposal.problemStatement}
                          </h4>
                          <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
                            {proposal.proposedChange?.description || "暂无描述"}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 bg-accent/20 rounded-lg p-2.5 text-[10px]">
                          <div>
                            <span className="text-hint">升级组件：</span>
                            <span className="text-foreground font-medium">{proposal.proposedChange?.targetComponent}</span>
                          </div>
                          <div>
                            <span className="text-hint">授权等级：</span>
                            <span className="text-foreground font-medium">{proposal.proposedChange?.automationLevel || "L2"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-border/40 pt-3">
                        <div className="flex items-center gap-1 text-[10px] text-hint">
                          <Clock className="size-3" />
                          <span>{new Date(proposal.createdAt).toLocaleDateString()}</span>
                        </div>
                        <Link 
                          href={`/approvals/${proposal.id}`}
                          className="text-primary hover:text-primary/80 text-xs font-semibold flex items-center gap-1 group"
                        >
                          去处理 <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            {/* 任务拦截审批列表筛选 */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { value: "pending", label: "待审批" },
                  { value: "approved", label: "已批准" },
                  { value: "rejected", label: "已拒绝" },
                  { value: "expired", label: "已过期" },
                  { value: "all", label: "全部" }
                ].map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setCheckpointFilter(t.value)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all border border-transparent",
                      checkpointFilter === t.value
                        ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    )}
                  >
                    {t.label} 
                    {t.value === "pending" && checkpoints.filter(c => c.status === "pending").length > 0 && (
                      <span className="ml-1 bg-danger/20 text-danger text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                        {checkpoints.filter(c => c.status === "pending").length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => fetchCheckpoints(checkpointFilter)}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent/30 transition-all flex items-center gap-1 text-xs"
                title="手动刷新"
              >
                <RefreshCw className="size-3.5" /> 刷新
              </button>
            </div>

            {/* Checkpoints 内容区域 */}
            {isCheckpointsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-44 bg-accent/30 rounded-xl animate-pulse border border-border/40" />
                ))}
              </div>
            ) : hasFetchError ? (
              <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-2xl bg-card/10 text-center">
                <AlertCircle className="size-10 text-danger opacity-80 mb-3" />
                <h3 className="text-sm font-semibold text-foreground">数据加载失败</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-4">网络请求或接口调用时遇到异常，请重试</p>
                <button
                  onClick={() => fetchCheckpoints(checkpointFilter)}
                  className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                >
                  <RefreshCw className="size-3.5" /> 点击重试
                </button>
              </div>
            ) : checkpoints.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-2xl bg-card/10 text-center">
                <ClipboardCheck className="size-10 text-muted-foreground opacity-50 mb-3" />
                <h3 className="text-sm font-semibold text-foreground">
                  {checkpointFilter === "pending" ? "暂无待审批项目" : 
                   checkpointFilter === "approved" ? "暂无已批准记录" :
                   checkpointFilter === "rejected" ? "暂无已拒绝记录" :
                   checkpointFilter === "expired" ? "暂无超时过期记录" : "暂无任何拦截记录"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">运行时未在此过滤条件下检测到需要介入的高危拦截动作</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {checkpoints.map((cp) => {
                  const isPending = cp.status === "pending";
                  const isExpired = cp.status === "expired";
                  const isApproved = cp.status === "approved";
                  const isRejected = cp.status === "rejected";
                  const isUrgent = cp.remainingMs < 7200000; // 小于 2h (7200000ms)

                  const isExpanded = expandedId === cp.id;

                  return (
                    <div 
                      key={cp.id}
                      className={cn(
                        "bg-card/40 border border-border backdrop-blur-md rounded-2xl p-5",
                        "hover:border-primary/20 transition-all flex flex-col justify-between space-y-4",
                        isPending && isUrgent && "border-danger/30 hover:border-danger/50"
                      )}
                    >
                      <div className="space-y-4">
                        {/* 顶部标题与 Badges */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-muted-foreground select-all">
                              {cp.checkpointId}
                            </span>
                            {/* 倒计时 */}
                            {isPending && (
                              <div className={cn(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-semibold",
                                isUrgent 
                                  ? "bg-danger/10 text-danger border-danger/20 animate-pulse font-bold" 
                                  : "bg-accent/40 text-muted-foreground border-border"
                              )}>
                                <Clock className="size-3" />
                                <span className={cn(isUrgent && "text-red-500")}>{formatCountdown(cp.remainingMs)}</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {/* 风险等级 */}
                            <span className={cn(
                              "text-[10px] px-2.5 py-0.5 rounded-full font-bold border tracking-wider",
                              cp.riskLevel === "high" || cp.riskLevel === "critical"
                                ? "bg-danger/10 text-danger border-danger/20" 
                                : cp.riskLevel === "medium" 
                                  ? "bg-warning/10 text-warning border-warning/20" 
                                  : "bg-success/10 text-success border-success/20"
                            )}>
                              {cp.riskLevel === "high" || cp.riskLevel === "critical" ? "HIGH" : cp.riskLevel === "medium" ? "MEDIUM" : "LOW"}
                            </span>

                            {/* 自动化等级 */}
                            <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] px-2 py-0.5 rounded-full font-bold">
                              {cp.automationLevel}
                            </span>

                            {/* 决策状态 */}
                            <span className={cn(
                              "text-[10px] px-2.5 py-0.5 rounded-full font-bold border uppercase",
                              isApproved ? "bg-success/15 text-success border-success/30" :
                              isRejected ? "bg-danger/15 text-danger border-danger/30" :
                              isExpired ? "bg-accent text-hint border-border" :
                              "bg-warning/15 text-warning border-warning/30"
                            )}>
                              {isApproved ? "已批准" : isRejected ? "已拒绝" : isExpired ? "已过期" : "待处理"}
                            </span>
                          </div>
                        </div>

                        {/* 拦截说明 */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1 flex-1">
                            <div className="text-foreground text-sm font-semibold flex items-center gap-1.5">
                              <span className="bg-foreground/5 border border-border px-2 py-0.5 rounded text-xs text-muted-foreground font-mono">
                                {cp.actionType}
                              </span>
                            </div>
                            <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                              {cp.actionSummary}
                            </p>
                          </div>
                          
                          {/* 触发人/Agent 信息 */}
                          <div className="flex items-center gap-2 text-xs bg-accent/20 px-3 py-1.5 rounded-xl border border-border/40 select-all shrink-0">
                            <User className="size-3.5 text-hint" />
                            <span className="text-foreground font-medium font-mono text-[11px]">
                              {cp.requestedBy}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 操作栏 & 详情折叠 */}
                      <div className="border-t border-border/40 pt-3">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : cp.id)}
                            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 p-1 rounded-lg transition-colors"
                          >
                            {isExpanded ? (
                              <>收起详情 <ChevronUp className="size-3.5" /></>
                            ) : (
                              <>展开详情 <ChevronDown className="size-3.5" /></>
                            )}
                          </button>

                          {/* 仅管理员可见决策动作且仅 pending 可审批 */}
                          {isPending && (
                            <div className="flex items-center gap-2">
                              {isAdmin ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={isDeciding !== null}
                                    onClick={() => {
                                      setActiveRejectId(activeRejectId === cp.id ? null : cp.id);
                                      setRejectComment("");
                                    }}
                                    className={cn(
                                      "bg-card hover:bg-accent border border-border text-foreground hover:text-danger rounded-xl px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 min-h-[32px]",
                                      activeRejectId === cp.id && "border-danger text-danger bg-danger/5"
                                    )}
                                  >
                                    <XCircle className="size-3.5" /> 拒绝执行
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isDeciding !== null}
                                    onClick={() => handleDecideCheckpoint(cp.id, "approved")}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 min-h-[32px]"
                                  >
                                    {isDeciding === cp.id ? (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="size-3.5" />
                                    )}
                                    批准放行
                                  </button>
                                </>
                              ) : (
                                <span className="text-[10px] text-hint flex items-center gap-1 bg-accent/20 px-2.5 py-1 rounded-lg border border-border/40 font-medium">
                                  <Shield className="size-3" /> 仅 Workspace 管理员有权审批
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 拒绝理由输入框 (内联抽屉效果) */}
                        {activeRejectId === cp.id && (
                          <div className="mt-4 bg-danger/5 border border-danger/20 rounded-xl p-4 space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-danger">拒绝动作备注 (必填)</span>
                              <span className="text-[10px] text-hint">提供该高危操作被拒绝的中止缘由</span>
                            </div>
                            <textarea
                              rows={3}
                              value={rejectComment}
                              onChange={(e) => setRejectComment(e.target.value)}
                              placeholder="请输入拒绝理由，例如：'检测到异常参数投放，取消该批量邮件发送。'..."
                              className="w-full bg-card border border-border focus:border-danger rounded-xl p-3 text-xs text-foreground placeholder:text-muted-foreground outline-none resize-none"
                            />
                            <div className="flex justify-end gap-2 text-xs">
                              <button
                                onClick={() => {
                                  setActiveRejectId(null);
                                  setRejectComment("");
                                }}
                                className="bg-card hover:bg-accent border border-border text-foreground px-3.5 py-1.5 rounded-lg font-medium transition-colors"
                              >
                                取消
                              </button>
                              <button
                                disabled={!rejectComment.trim() || isDeciding !== null}
                                onClick={() => handleDecideCheckpoint(cp.id, "rejected", rejectComment)}
                                className="bg-danger hover:bg-danger/90 text-white px-4 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50"
                              >
                                确认拒绝
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 详情卡片内容 */}
                        {isExpanded && (
                          <div className="mt-4 bg-accent/10 border border-border/50 rounded-xl p-4 space-y-3.5 text-xs text-muted-foreground">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <span className="text-hint">关联子任务 ID：</span>
                                <div className="flex items-center gap-1.5 bg-card px-2.5 py-1 rounded-lg border border-border/40 font-mono text-[11px] text-foreground max-w-full overflow-x-auto select-all">
                                  <span>{cp.taskId || "N/A"}</span>
                                  {cp.taskId && (
                                    <button 
                                      onClick={() => handleCopyText(cp.taskId!, "task")}
                                      className="hover:text-foreground hover:bg-accent/40 p-0.5 rounded transition-all shrink-0"
                                      title="复制"
                                    >
                                      {copiedId === `task-${cp.taskId}` ? (
                                        <Check className="size-3 text-success animate-scale" />
                                      ) : (
                                        <Copy className="size-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-hint">工作流执行 ID：</span>
                                <div className="flex items-center gap-1.5 bg-card px-2.5 py-1 rounded-lg border border-border/40 font-mono text-[11px] text-foreground max-w-full overflow-x-auto select-all">
                                  <span>{cp.workflowRunId || "N/A"}</span>
                                  {cp.workflowRunId && (
                                    <button 
                                      onClick={() => handleCopyText(cp.workflowRunId!, "workflow")}
                                      className="hover:text-foreground hover:bg-accent/40 p-0.5 rounded transition-all shrink-0"
                                      title="复制"
                                    >
                                      {copiedId === `workflow-${cp.workflowRunId}` ? (
                                        <Check className="size-3 text-success animate-scale" />
                                      ) : (
                                        <Copy className="size-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-t border-border/30 pt-3 text-[11px]">
                              <div>
                                <span className="text-hint">失效时间：</span>
                                <span className="text-foreground font-medium">
                                  {new Date(cp.expiresAt).toLocaleString()}
                                </span>
                              </div>

                              {cp.proposalId && (
                                <Link 
                                  href={`/approvals/${cp.proposalId}`}
                                  className="text-primary hover:text-primary/80 font-semibold flex items-center gap-1 transition-colors hover:underline"
                                >
                                  查看关联进化提案详情 <ExternalLink className="size-3" />
                                </Link>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}

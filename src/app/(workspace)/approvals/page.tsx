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
  Loader2
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { cn } from "@/lib/utils";
import type { HarnessProposal } from "@/contracts/harness-proposal";

export default function ApprovalsPage() {
  const [activeCategory, setActiveCategory] = useState<"proposals" | "checkpoints">("proposals");
  
  // Proposals 状态
  const [proposals, setProposals] = useState<HarnessProposal[]>([]);
  const [filter, setFilter] = useState<"all" | "draft" | "canary">("all");
  const [isLoading, setIsLoading] = useState(true);

  // Checkpoints 状态
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [isCheckpointsLoading, setIsCheckpointsLoading] = useState(false);
  const [isDeciding, setIsDeciding] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    fetch("/api/proposals")
      .then((res) => {
        if (!res.ok) throw new Error("加载提案失败");
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setProposals(data.proposals || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load proposals:", err);
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const fetchCheckpoints = useCallback(() => {
    setIsCheckpointsLoading(true);
    fetch("/api/approvals")
      .then((res) => {
        if (!res.ok) throw new Error("加载任务拦截列表失败");
        return res.json();
      })
      .then((resData) => {
        setCheckpoints(resData.data || []);
        setIsCheckpointsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load checkpoints:", err);
        setIsCheckpointsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (activeCategory === "checkpoints") {
      fetchCheckpoints();
    }
  }, [activeCategory, fetchCheckpoints]);

  const handleDecideCheckpoint = async (id: string, decision: "approved" | "rejected") => {
    setIsDeciding(id);
    const toastId = toast.loading("正在提交审批决策...");
    try {
      const res = await fetch(`/api/approvals/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "决策提交失败");
      }
      toast.success(decision === "approved" ? "审批通过，已继续执行！" : "审批已驳回并中止。", { id: toastId });
      fetchCheckpoints();
    } catch (err: any) {
      toast.error(`决策提交失败: ${err.message}`, { id: toastId });
    } finally {
      setIsDeciding(null);
    }
  };

  const filteredProposals = proposals.filter((p) => {
    const isApprovalState = p.status === "draft" || p.status === "canary";
    if (!isApprovalState) return false;
    
    if (filter === "all") return true;
    return p.status === filter;
  });

  return (
    <PageTransition>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <PageHeader 
          title="审批中心" 
          description="系统升级提案与运行时高危任务拦截决策面板"
        />

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
              "pb-2.5 border-b-2 px-1 transition-all",
              activeCategory === "checkpoints"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            任务拦截审批 (L3/L4)
            {checkpoints.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center size-5 rounded-full bg-danger/20 text-danger text-xs font-bold">
                {checkpoints.length}
              </span>
            )}
          </button>
        </div>

        {activeCategory === "proposals" ? (
          <>
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <button
                onClick={() => setFilter("all")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                  filter === "all" 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "text-muted-foreground hover:bg-accent/40"
                )}
              >
                全部待办 ({proposals.filter(p => p.status === "draft" || p.status === "canary").length})
              </button>
              <button
                onClick={() => setFilter("draft")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                  filter === "draft" 
                    ? "bg-warning/20 text-warning border border-warning/30" 
                    : "text-muted-foreground hover:bg-accent/40"
                )}
              >
                待审批 ({proposals.filter(p => p.status === "draft").length})
              </button>
              <button
                onClick={() => setFilter("canary")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                  filter === "canary" 
                    ? "bg-info/20 text-info border border-info/30" 
                    : "text-muted-foreground hover:bg-accent/40"
                )}
              >
                灰度中 ({proposals.filter(p => p.status === "canary").length})
              </button>
            </div>

            {isLoading ? (
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
            {isCheckpointsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-44 bg-accent/30 rounded-xl animate-pulse border border-border/40" />
                ))}
              </div>
            ) : checkpoints.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-2xl bg-card/10 text-center">
                <ClipboardCheck className="size-10 text-muted-foreground opacity-50 mb-3" />
                <h3 className="text-sm font-semibold text-foreground">暂无未决拦截任务</h3>
                <p className="text-xs text-muted-foreground mt-1">当前没有智能体触发高危动作拦截</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {checkpoints.map((cp) => (
                  <div 
                    key={cp.id}
                    className="bg-card/40 border border-border backdrop-blur-md rounded-xl p-5 hover:border-primary/20 hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-muted-foreground">
                          {cp.checkpointId}
                        </span>
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-semibold border",
                          cp.riskLevel === "high" ? "bg-danger/10 text-danger border-danger/20" :
                          cp.riskLevel === "medium" ? "bg-warning/10 text-warning border-warning/20" :
                          "bg-success/10 text-success border-success/20"
                        )}>
                          {cp.riskLevel === "high" ? "高风险" : cp.riskLevel === "medium" ? "中风险" : "低风险"}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-foreground text-sm font-semibold leading-relaxed">
                          拦截原因：{cp.triggerReason}
                        </h4>
                        <div className="text-xs text-muted-foreground mt-3 space-y-1 bg-accent/20 rounded-lg p-3">
                          {cp.workflowRunId && (
                            <div className="flex justify-between items-center">
                              <span className="text-hint">关联工作流运行：</span>
                              <span className="font-mono text-foreground select-all">{cp.workflowRunId.slice(0, 16)}...</span>
                            </div>
                          )}
                          {cp.taskId && (
                            <div className="flex justify-between items-center">
                              <span className="text-hint">关联子任务：</span>
                              <span className="font-mono text-foreground select-all">{cp.taskId.slice(0, 16)}...</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            <span className="text-hint">自动化拦截级别：</span>
                            <span className="font-semibold text-primary">{cp.automationLevel}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-hint">创建时间：</span>
                            <span className="text-foreground">{new Date(cp.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 border-t border-border/40 pt-3">
                      <button
                        type="button"
                        disabled={isDeciding !== null}
                        onClick={() => handleDecideCheckpoint(cp.id, "rejected")}
                        className="flex-1 bg-card hover:bg-accent border border-border text-foreground hover:text-danger rounded-lg py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 min-h-[36px]"
                      >
                        <XCircle className="size-3.5" /> 拒绝执行
                      </button>
                      <button
                        type="button"
                        disabled={isDeciding !== null}
                        onClick={() => handleDecideCheckpoint(cp.id, "approved")}
                        className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 min-h-[36px]"
                      >
                        {isDeciding === cp.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3.5" />
                        )}
                        批准放行
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}

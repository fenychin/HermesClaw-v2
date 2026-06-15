"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  ClipboardCheck, 
  Clock, 
  Activity, 
  ArrowRight, 
  AlertCircle,
  FileText
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { cn } from "@/lib/utils";
import type { HarnessProposal } from "@/contracts/harness-proposal";

export default function ApprovalsPage() {
  const [proposals, setProposals] = useState<HarnessProposal[]>([]);
  const [filter, setFilter] = useState<"all" | "draft" | "canary">("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
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

  // 仅展示 draft/canary 的待审批/灰度观察提案，或者根据筛选进行过滤
  const filteredProposals = proposals.filter((p) => {
    // 基础过滤：仅展示 draft 或 canary 状态的提案以用于审批与灰度控制
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
          description="Harness 自演化升级提案审计与授权控制面板"
        />

        {/* 顶部标签式状态筛选器 */}
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

        {/* 加载状态 */}
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
                    {/* 头部：编号 & 状态标签 */}
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

                    {/* 问题陈述 */}
                    <div>
                      <h4 className="text-foreground text-sm font-semibold line-clamp-1">
                        {proposal.problemStatement}
                      </h4>
                      <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
                        {proposal.proposedChange?.description || "暂无描述"}
                      </p>
                    </div>

                    {/* 指标 & 影响 */}
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

                  {/* 底部链接与时间 */}
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
      </div>
    </PageTransition>
  );
}

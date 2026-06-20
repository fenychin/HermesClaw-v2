"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { HarnessProposal } from "@/types";
import { resolveAutomationLevel } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProposalCard } from "./_components/proposal-card";
import { L3ApproveAlert } from "./_components/l3-approve-alert";
import { ProposalDetailSheet } from "./_components/proposal-detail-sheet";
import { useTradeStore } from "@/stores/trade-store";
import {
  ShieldCheck,
  Clock,
  BookOpen,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";

/** 懒加载审批概览环形图（recharts 体积大且仅客户端渲染） */
const ApprovalDonutChart = dynamic(
  () => import("./_components/approval-donut-chart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-hint text-xs">
        图表加载中...
      </div>
    ),
  },
);

/** Tab 值 → 过滤逻辑 */
type TabValue = "pending" | "processed" | "all";

/** 根据 Tab 过滤提案 */
function filterByTab(
  proposals: HarnessProposal[],
  tab: TabValue,
): HarnessProposal[] {
  if (tab === "pending") return proposals.filter((p) => p.status === "pending");
  if (tab === "processed")
    return proposals.filter((p) => p.status !== "pending");
  return proposals;
}

/**
 * Harness 升级审批中心
 * —— 对应 AGENTS.md 第三章自演化架构中的 Level 3 进化层
 *    所有 Harness 变更均须经由人类审批（§3.1），此页面为审批操作的唯一 UI 入口
 */
export default function HarnessApprovalPage() {
  const { harnessProposals: proposals, loadProposals: fetchProposals, approveProposal, rejectProposal } = useTradeStore();
  const [activeTab, setActiveTab] = useState<TabValue>("pending");

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  /* 详情弹窗状态 */
  const [detailTarget, setDetailTarget] = useState<HarnessProposal | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState(false);

  /* L3 高风险二次确认弹窗状态 */
  const [confirmTarget, setConfirmTarget] = useState<HarnessProposal | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  /* 真实 approve API 调用（TanStack Query 承载服务端状态，CLAUDE.md §7） */
  const approveMutation = useMutation({
    mutationFn: async ({
      proposal,
      confirmed,
    }: {
      proposal: HarnessProposal;
      confirmed: boolean;
    }) => {
      const res = await fetch(
        `/api/harness/proposals/${proposal.proposalId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmText: confirmed ? "确认执行" : undefined,
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // L4 硬拒绝 / RBAC 拒绝 / L3 缺确认等
        throw new Error(body.message ?? body.error ?? `审批失败 (${res.status})`);
      }
      return body;
    },
    onSuccess: (_data, { proposal }) => {
      approveProposal(proposal.id, "当前用户");
      toast.success(`提案 ${proposal.proposalId} 已批准`);
      setConfirmOpen(false);
      setConfirmTarget(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  /* 真实 reject API 调用（AGENTS.md §4.11 所有写操作须经 RBAC 门禁） */
  const rejectMutation = useMutation({
    mutationFn: async (proposal: HarnessProposal) => {
      const res = await fetch(
        `/api/harness/proposals/${proposal.proposalId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message ?? body.error ?? `拒绝失败 (${res.status})`);
      }
      return body;
    },
    onSuccess: (_data, proposal) => {
      rejectProposal(proposal.id, "当前用户");
      toast.success(`提案 ${proposal.proposalId} 已拒绝`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  /* 统计数据 */
  const stats = useMemo(() => {
    const pending = proposals.filter((p) => p.status === "pending").length;
    const approved = proposals.filter((p) => p.status === "approved").length;
    const rejected = proposals.filter((p) => p.status === "rejected").length;
    return { pending, approved, rejected, total: proposals.length };
  }, [proposals]);

  /* 按 Tab 过滤 */
  const filteredProposals = useMemo(
    () => filterByTab(proposals, activeTab),
    [proposals, activeTab],
  );

  /* 查看详情 */
  const handleViewDetail = useCallback((proposal: HarnessProposal) => {
    setDetailTarget(proposal);
    setDetailOpen(true);
  }, []);

  /* 批准流程：L4 拒绝、L3 二次确认、L1/L2 调 API（AGENTS.md §4.7） */
  const handleApprove = useCallback((proposal: HarnessProposal) => {
    const level = resolveAutomationLevel(
      proposal.proposedChange.automationLevel,
      proposal.proposedChange.riskLevel,
    );

    // L4：绝对禁止自动，审批通道亦不得放行
    if (level === "L4") {
      toast.error("L4 提案禁止系统自动审批，须在源业务系统人工发起");
      return;
    }

    // L3：高风险须二次确认
    if (level === "L3") {
      setConfirmTarget(proposal);
      setConfirmOpen(true);
      return;
    }

    // L1/L2：直接调 API 审批（走服务端 checkAutomationGate + 审计）
    approveMutation.mutate({ proposal, confirmed: false });
  }, [approveMutation]);

  /* 二次确认后执行真实 approve API */
  const handleConfirmApprove = useCallback(
    (proposal: HarnessProposal) => {
      approveMutation.mutate({ proposal, confirmed: true });
    },
    [approveMutation],
  );

  /* 拒绝：调真实 API（走服务端 checkAutomationGate + RBAC + 审计） */
  const handleReject = useCallback((proposal: HarnessProposal) => {
    rejectMutation.mutate(proposal);
  }, [rejectMutation]);

  return (
    <div className="flex gap-6 p-6 min-h-full">
      {/* 左主区 */}
      <div className="flex-1 min-w-0">
        <PageHeader
          title="Harness 升级审批中心"
          description="管理动态 Harness 自演化系统的升级提案，所有变更须经人工审批"
          breadcrumb={[
            { label: "设置", href: "/settings" },
            { label: "Harness 审批" },
          ]}
        />

        {/* Tabs */}
        <Tabs
          defaultValue="pending"
          onValueChange={(v) => setActiveTab(v as TabValue)}
        >
          <TabsList>
            <TabsTrigger value="pending">
              待审批
              {stats.pending > 0 && (
                <span className="ml-1 inline-flex items-center justify-center size-5 rounded-full bg-warning/20 text-warning text-xs font-semibold">
                  {stats.pending}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="processed">已处理</TabsTrigger>
            <TabsTrigger value="all">全部</TabsTrigger>
          </TabsList>

          {/* 提案列表 */}
          <TabsContent value={activeTab} className="mt-4">
            {filteredProposals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <ShieldCheck className="size-12 mb-3 text-hint" />
                <p className="text-sm">
                  {activeTab === "pending"
                    ? "暂无待审批的 Harness 升级提案"
                    : "暂无提案记录"}
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {filteredProposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    onViewDetail={handleViewDetail}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* 右侧面板：审批统计与规则说明 */}
      <aside className="w-80 shrink-0 space-y-4 overflow-y-auto">
        {/* 审批统计卡片 */}
        <div className="bg-card rounded-2xl border border-border p-5 mb-4">
          <h2 className="text-foreground text-sm font-medium mb-4 flex items-center gap-1.5">
            <ShieldCheck className="size-4" />
            审批概览
          </h2>
          
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
              <div className="text-muted-foreground text-xs mb-1">待审批</div>
              <div className="text-warning font-semibold text-lg">{stats.pending} 个</div>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
              <div className="text-muted-foreground text-xs mb-1">本月已批准</div>
              <div className="text-success font-semibold text-lg">{stats.approved} 个</div>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
              <div className="text-muted-foreground text-xs mb-1">本月已拒绝</div>
              <div className="text-danger font-semibold text-lg">{stats.rejected} 个</div>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
              <div className="text-muted-foreground text-xs mb-1">平均审批耗时</div>
              <div className="text-foreground font-semibold text-lg">2.4 小时</div>
            </div>
          </div>

          <div className="h-[160px] relative">
            <ApprovalDonutChart
              approved={stats.approved}
              rejected={stats.rejected}
              pending={stats.pending}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-muted-foreground text-xs">总提案</span>
              <span className="text-foreground font-bold text-xl">{stats.total}</span>
            </div>
          </div>
        </div>

        {/* 自动化等级说明卡片 */}
        <div className="bg-card rounded-2xl border border-border p-5 mb-4">
          <h3 className="text-foreground text-sm font-medium flex items-center gap-1.5 mb-4">
            <BookOpen className="size-4" />
            自动化等级规则
          </h3>
          <div className="space-y-4 text-xs">
            <div className="flex items-start gap-3">
              <span className="bg-success/20 text-success font-mono font-semibold px-1.5 rounded shrink-0">L1</span>
              <span className="text-muted-foreground mt-0.5">全自动执行，无需审批</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-muted text-muted-foreground font-mono font-semibold px-1.5 rounded shrink-0">L2</span>
              <span className="text-muted-foreground mt-0.5">自动执行，事后可审查</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-warning/20 text-warning font-mono font-semibold px-1.5 rounded shrink-0">L3</span>
              <span className="text-muted-foreground mt-0.5">需人工二次确认，确认后立即生效</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-danger/20 text-danger font-mono font-semibold px-1.5 rounded shrink-0">L4</span>
              <span className="text-muted-foreground mt-0.5">绝对禁止自动，须在源系统手动发起</span>
            </div>
          </div>
          <p className="text-hint text-xs mt-3 border-t border-border/50 pt-3">
            以上规则依据 AGENTS.md §4.7，不可绕过
          </p>
        </div>

        {/* 最近进化日志入口卡片 */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground text-sm font-medium flex items-center gap-1.5">
              <Clock className="size-4" />
              进化日志
            </h3>
            <Link
              href="/settings/harness/evolution-log"
              className="text-brand-blue hover:text-brand-blue/80 text-xs transition-colors"
            >
              查看全部
            </Link>
          </div>
          
          <div className="space-y-3">
            {proposals
              .filter((p) => p.status !== "pending")
              .slice(0, 3)
              .map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground truncate max-w-[100px]">
                      {p.proposalId}
                    </span>
                    {p.status === "approved" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success">已通过</span>
                    ) : p.status === "rejected" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/10 text-danger">已驳回</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{p.status}</span>
                    )}
                  </div>
                  <span className="text-hint">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            {proposals.filter((p) => p.status !== "pending").length === 0 && (
              <div className="text-center py-4 text-xs text-hint">
                暂无已处理记录
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 详情弹窗 */}
      <ProposalDetailSheet
        proposal={detailTarget}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onApprove={handleApprove}
        onReject={handleReject}
      />

      {/* L3 高风险二次确认弹窗 */}
      <L3ApproveAlert
        proposal={confirmTarget}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmApprove}
        isPending={approveMutation.isPending}
      />
    </div>
  );
}


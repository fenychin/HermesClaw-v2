"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  CheckCircle2, 
  XCircle, 
  RotateCcw, 
  ArrowLeft, 
  ShieldAlert, 
  Sparkles,
  Layers,
  Terminal,
  Activity,
  UserCheck
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { cn } from "@/lib/utils";
import type { HarnessProposal } from "@/contracts/harness-proposal";

interface SnapshotDetail {
  agentId: string;
  canDo: string[];
  cannotDo: string[];
  bindConnectors: string[];
  bindSkills: string[];
  harnessVersion: string;
  snapshotAt: string;
}

export default function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [proposal, setProposal] = useState<HarnessProposal | null>(null);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchMetrics = (proposalId: string) => {
    fetch(`/api/proposals/${proposalId}/metrics`)
      .then((r) => {
        if (!r.ok) throw new Error("加载灰度指标失败");
        return r.json();
      })
      .then((m) => {
        if (m.success) {
          setMetrics(m.metrics);
        }
      })
      .catch((e) => console.error("Failed to load canary metrics:", e));
  };

  useEffect(() => {
    let active = true;
    fetch("/api/proposals")
      .then((res) => {
        if (!res.ok) throw new Error("加载提案失败");
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        const list = (data.proposals || []) as HarnessProposal[];
        const found = list.find((p) => p.id === id);
        setProposal(found || null);
        
        if (found && found.status === "canary") {
          fetchMetrics(id);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Error loading proposal detail:", err);
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const handleAction = async (action: "approve" | "reject" | "rollback") => {
    setIsSubmitting(true);
    const toastId = toast.loading("正在处理提案决策...");
    try {
      const res = await fetch(`/api/proposals/${id}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || data.message || "请求失败");
      }

      toast.success(
        action === "approve" 
          ? "提案已审批通过，已进入灰度观察期 (Canary)！" 
          : action === "reject" 
            ? "提案已被拒绝并归档。" 
            : "提案状态与关联 Agent 快照已完成一键回滚。",
        { id: toastId }
      );

      // 刷新本页数据
      if (action === "reject" || action === "rollback") {
        router.push("/approvals");
      } else {
        // 审批后刷新本提案内容
        const updatedRes = await fetch("/api/proposals");
        const updatedData = await updatedRes.json();
        const found = (updatedData.proposals || []).find((p: HarnessProposal) => p.id === id);
        setProposal(found || null);
        if (found && found.status === "canary") {
          fetchMetrics(id);
        } else {
          setMetrics(null);
        }
      }
    } catch (err: any) {
      toast.error(`决策处理失败: ${err.message}`, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-accent/30 rounded" />
        <div className="h-40 bg-accent/30 rounded-xl" />
        <div className="grid grid-cols-2 gap-4 h-64 bg-accent/30 rounded-xl" />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center space-y-4">
        <ShieldAlert className="size-12 text-danger mx-auto" />
        <h3 className="text-lg font-semibold text-foreground">未找到相关升级提案</h3>
        <button onClick={() => router.push("/approvals")} className="text-primary text-sm font-semibold flex items-center gap-1 mx-auto">
          <ArrowLeft className="size-4" /> 返回审批列表
        </button>
      </div>
    );
  }

  // 解析快照数据
  const snapshot: SnapshotDetail | null = proposal.previousSnapshot as SnapshotDetail | null;

  return (
    <PageTransition>
      <div className="p-6 max-w-6xl mx-auto space-y-6 pb-12">
        {/* 返回头 */}
        <button 
          onClick={() => router.push("/approvals")}
          className="text-muted-foreground hover:text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="size-3.5" /> 返回审批列表
        </button>

        {/* 主标题头 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-muted-foreground bg-accent/40 rounded px-2.5 py-0.5">
                {proposal.proposalId}
              </span>
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-semibold border",
                proposal.status === "draft" 
                  ? "bg-warning/10 text-warning border-warning/20" 
                  : proposal.status === "canary"
                    ? "bg-info/10 text-info border-info/20 animate-pulse"
                    : proposal.status === "rolled-back"
                      ? "bg-danger/10 text-danger border-danger/20"
                      : "bg-success/10 text-success border-success/20"
              )}>
                {proposal.status === "draft" ? "待审批 (Draft)" : 
                 proposal.status === "canary" ? "灰度观察中 (Canary)" : 
                 proposal.status === "rolled-back" ? "已回滚 (Rolled Back)" : "已激活"}
              </span>
            </div>
            <h1 className="text-foreground text-xl font-bold tracking-tight">
              {proposal.problemStatement}
            </h1>
            <p className="text-hint text-xs">
              自演化决策规则触发时间：{new Date(proposal.createdAt).toLocaleString()} · 触发源：{proposal.triggeredBy === "auto" ? "Hermes 评估引擎" : "人工手动"}
            </p>
          </div>

          {/* 审批与回滚决策操作栏 */}
          <div className="flex items-center gap-2">
            {proposal.status === "draft" && (
              <>
                <button
                  disabled={isSubmitting}
                  onClick={() => handleAction("reject")}
                  className="bg-card hover:bg-accent border border-border text-foreground hover:text-danger rounded-xl px-4 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <XCircle className="size-4" /> 拒绝提案
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={() => handleAction("approve")}
                  className="bg-primary hover:bg-primary/95 text-primary-foreground rounded-xl px-4 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                >
                  <CheckCircle2 className="size-4" /> 批准并加入灰度
                </button>
              </>
            )}
            
            {proposal.status === "canary" && (
              <>
                <button
                  disabled={isSubmitting}
                  onClick={() => handleAction("reject")}
                  className="bg-card hover:bg-accent border border-border text-foreground hover:text-danger rounded-xl px-4 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <XCircle className="size-4" /> 终止并拒绝
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={() => handleAction("rollback")}
                  className="bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger rounded-xl px-4 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="size-4 animate-spin-hover" /> 撤销回滚 (Rollback)
                </button>
              </>
            )}
          </div>
        </div>

        {/* 看板基本字段网格 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card/35 border border-border rounded-xl p-4 space-y-1">
            <span className="text-[10px] text-hint flex items-center gap-1">
              <Layers className="size-3.5" /> 升级组件类型
            </span>
            <p className="text-foreground text-sm font-semibold">{proposal.proposedChange?.targetComponent}</p>
          </div>
          <div className="bg-card/35 border border-border rounded-xl p-4 space-y-1">
            <span className="text-[10px] text-hint flex items-center gap-1">
              <Activity className="size-3.5" /> 预期降低指标影响
            </span>
            <p className="text-foreground text-sm font-semibold">{proposal.estimatedImpact}</p>
          </div>
          <div className="bg-card/35 border border-border rounded-xl p-4 space-y-1">
            <span className="text-[10px] text-hint flex items-center gap-1">
              <UserCheck className="size-3.5" /> 需要人类审批审核
            </span>
            <p className="text-foreground text-sm font-semibold">{proposal.requiresHumanApproval ? "必须经过授权" : "允许自动演化"}</p>
          </div>
        </div>

        {/* Canary 灰度指标实时监控卡片 */}
        {proposal.status === "canary" && metrics && (
          <div className="bg-card/40 border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-info animate-pulse" />
                <h3 className="text-foreground font-semibold text-sm">Canary 灰度指标实时监控</h3>
              </div>
              <span className="text-[10px] text-hint">
                监控起点：{new Date(metrics.monitorSince || proposal.reviewedAt || proposal.createdAt).toLocaleString()}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-accent/20 rounded-lg p-3 space-y-1">
                <span className="text-[10px] text-hint">灰度运行次数</span>
                <p className="text-foreground text-lg font-mono font-semibold">{metrics.totalLogs}</p>
              </div>
              <div className="bg-accent/20 rounded-lg p-3 space-y-1">
                <span className="text-[10px] text-hint">异常/错误数</span>
                <p className="text-foreground text-lg font-mono font-semibold">{metrics.totalErrors}</p>
              </div>
              <div className="bg-accent/20 rounded-lg p-3 space-y-1">
                <span className="text-[10px] text-hint">当前失败率</span>
                <p className={cn("text-lg font-mono font-semibold", metrics.errorRate > 0.15 ? "text-danger animate-pulse" : "text-success")}>
                  {(metrics.errorRate * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-hint">
                <span>灰度失败率指示条（红线 15.0%）</span>
                <span>{(metrics.errorRate * 100).toFixed(1)}% / 15.0%</span>
              </div>
              <div className="w-full bg-accent/35 rounded-full h-2 overflow-hidden relative">
                <div className="absolute left-[15%] top-0 bottom-0 w-0.5 bg-danger/50 z-10" title="15% 警界线" />
                <div 
                  className={cn("h-full transition-all duration-500", metrics.errorRate > 0.15 ? "bg-danger" : "bg-info")}
                  style={{ width: `${Math.min(metrics.errorRate * 100, 100)}%` }}
                />
              </div>
            </div>

            {metrics.totalLogs >= 5 && metrics.errorRate > 0.15 && (
              <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 flex gap-2">
                <ShieldAlert className="text-danger size-4 shrink-0 mt-0.5" />
                <div>
                  <p className="text-danger text-xs font-bold">灰度期失败率超标报警</p>
                  <p className="text-muted-foreground text-[10px] mt-0.5 leading-snug">
                    当前灰度运行次数已达 {metrics.totalLogs} 次，且失败率已达 {(metrics.errorRate * 100).toFixed(1)}%（超出 15.0% 红线）。
                    系统将在下一次定时评估时自动触发快照回滚。您也可以手动点击上方“撤销回滚 (Rollback)”按钮立即恢复。
                  </p>
                </div>
              </div>
            )}

            {metrics.recentErrors && metrics.recentErrors.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border/40">
                <h4 className="text-xs font-semibold text-foreground">最近发生的异常详情</h4>
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {metrics.recentErrors.map((err: any, idx: number) => (
                    <div key={idx} className="bg-accent/20 border border-border/40 rounded p-2 text-[10px] space-y-1">
                      <div className="flex items-center justify-between text-hint font-mono">
                        <span>任务: {err.taskName || "未知"}</span>
                        <span>{new Date(err.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-foreground font-mono whitespace-pre-wrap break-all">{err.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 核心 Diff 对比区域 */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="text-primary size-4 shrink-0" />
            <h3 className="text-foreground font-semibold text-sm">Harness Bundle 配置变更对比 (Diff)</h3>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左边：当前关联 Agent 的状态快照 (BEFORE) */}
            <div className="bg-card/35 border border-border rounded-xl overflow-hidden flex flex-col">
              <div className="bg-accent/40 border-b border-border px-4 py-3 flex items-center justify-between">
                <span className="text-foreground text-xs font-bold flex items-center gap-1">
                  <Terminal className="size-3.5 text-muted-foreground" />
                  变更前快照 (Before Snapshot)
                </span>
                <span className="text-[10px] text-hint font-mono">
                  {snapshot ? `Version: ${snapshot.harnessVersion}` : "v1.0.0"}
                </span>
              </div>
              <div className="p-4 space-y-4 flex-1">
                {snapshot ? (
                  <div className="space-y-4">
                    {/* 任务边界 */}
                    <div className="space-y-1.5">
                      <h5 className="text-xs text-hint font-medium">允许动作 (canDo)</h5>
                      <div className="flex flex-wrap gap-1.5">
                        {snapshot.canDo.map((item, index) => (
                          <span key={index} className="text-[10px] font-mono bg-accent/50 text-foreground border border-border rounded px-2 py-0.5">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <h5 className="text-xs text-hint font-medium">禁止动作 (cannotDo)</h5>
                      <div className="flex flex-wrap gap-1.5">
                        {snapshot.cannotDo.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground italic">无特别限制</span>
                        ) : (
                          snapshot.cannotDo.map((item, index) => (
                            <span key={index} className="text-[10px] font-mono bg-danger/10 text-danger border border-danger/20 rounded px-2 py-0.5">
                              {item}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {/* 工具/技能绑定 */}
                    <div className="grid grid-cols-2 gap-4 border-t border-border/40 pt-3">
                      <div className="space-y-1">
                        <span className="text-[10px] text-hint">绑定的连接器 (Connectors)</span>
                        <div className="text-[10px] text-foreground font-mono space-y-0.5">
                          {snapshot.bindConnectors.length === 0 ? "暂无" : snapshot.bindConnectors.map((c, i) => (
                            <div key={i}>· {c}</div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-hint">绑定的技能集 (Skills)</span>
                        <div className="text-[10px] text-foreground font-mono space-y-0.5">
                          {snapshot.bindSkills.length === 0 ? "暂无" : snapshot.bindSkills.map((s, i) => (
                            <div key={i}>· {s}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-hint italic">无关联智能体快照备份</p>
                )}
              </div>
            </div>

            {/* 右边：演化升级方案 (AFTER) */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl overflow-hidden flex flex-col">
              <div className="bg-primary/10 border-b border-primary/20 px-4 py-3 flex items-center justify-between">
                <span className="text-primary text-xs font-bold flex items-center gap-1">
                  <Sparkles className="size-3.5 text-primary" />
                  提案升级策略 (After Proposal)
                </span>
                <span className="text-[10px] text-primary/80 font-mono">
                  Automation: {proposal.proposedChange?.automationLevel || "L2"}
                </span>
              </div>
              <div className="p-4 space-y-4 flex-1">
                <div className="space-y-4">
                  {/* 变更方案说明 */}
                  <div className="space-y-1.5">
                    <h5 className="text-xs text-primary/80 font-medium">调整变更方案</h5>
                    <div className="bg-background border border-primary/20 rounded-xl p-3">
                      <p className="text-foreground text-xs leading-relaxed font-semibold">
                        {proposal.proposedChange?.description}
                      </p>
                    </div>
                  </div>

                  {/* 回滚计划 */}
                  <div className="space-y-1.5">
                    <h5 className="text-xs text-primary/80 font-medium">回滚补偿方案 (Rollback Plan)</h5>
                    <div className="bg-background border border-border rounded-xl p-3">
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        {proposal.rollbackPlan || "如遇不可控运行失败，触发一键回撤快照版本机制。"}
                      </p>
                    </div>
                  </div>

                  {/* 变更风险提示 */}
                  <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 flex gap-2">
                    <ShieldAlert className="text-warning size-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-warning text-xs font-bold">自演化安全提示</p>
                      <p className="text-muted-foreground text-[10px] mt-0.5 leading-snug">
                        提案一经执行，将对关联智能体的底座运行策略进行实时更新发布。
                        建议在发布后 72 小时内针对相关服务和 API 回调指标保持追踪。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}

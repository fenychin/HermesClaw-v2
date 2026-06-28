/**
 * Panel5EvolutionCore — 人机进化核心面板 (P5)
 *
 * Phase 5 升级：接入进化闭环。
 * - GEN-N 代数 + 待审批计数
 * - 对齐度折线（最近 20 点）
 * - 权重修正日志
 * - 提案列表（限制 WorkflowTemplate / SkillBinding / EvalRuleSet / MemoryPolicy）
 * - 采纳/拒绝操作 + 详情弹窗
 * - 最近审批人签名区
 *
 * v3.43 升级：
 * - 采纳 → POST /api/v1/evolution/adopt → 创建 ApprovalCheckpoint → AuditLog
 * - 拒绝 → POST /api/v1/evolution/reject → AuditLog
 * - 详情弹窗 → 展示 proposal 完整内容 + 触发条件
 * - 治理边界：所有审批动作只跳转审批中心，不允许直接批准
 */
"use client"

import React, { useMemo, useState, useCallback } from "react"
import { useEvolutionProposals } from "@/hooks/use-evolution-proposals"
import type { EvolutionProposalItem } from "@/hooks/use-evolution-proposals"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

// ─── 常量 ──────────────────────────────────────────────────────────────

const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  WorkflowTemplate: "工作流模板",
  SkillBinding: "技能绑定",
  EvalRuleSet: "评估规则",
  MemoryPolicy: "记忆策略",
  AgentPolicy: "Agent 策略",
  ContextPolicy: "上下文策略",
  ConnectorPolicy: "连接器策略",
}

const STATUS_BADGE: Record<string, { label: string; variant: "outline" | "secondary" | "default" | "destructive" }> = {
  draft: { label: "草案", variant: "outline" },
  pending: { label: "待审批", variant: "secondary" },
  approved: { label: "已批准", variant: "default" },
  rejected: { label: "已拒绝", variant: "destructive" },
  implemented: { label: "已实现", variant: "default" },
  "rolled-back": { label: "已回滚", variant: "destructive" },
}

const RISK_COLORS: Record<string, string> = {
  low: "text-emerald-400",
  medium: "text-amber-400",
  high: "text-red-400",
  critical: "text-red-500 font-bold",
}

/** 最近 N 条（面板只展示最近 5 条） */
const MAX_VISIBLE_PROPOSALS = 5

// ─── Action 状态 ─────────────────────────────────────────────────────

type ActionState = "idle" | "loading" | "success" | "error"

// ─── 子组件：对齐度折线 ────────────────────────────────────────────────

function AlignmentChart({ history }: { history: number[] }) {
  if (history.length === 0) {
    return <p className="text-[10px] text-zinc-600 italic">暂无对齐度数据</p>
  }

  const maxVal = Math.max(...history, 0.1)
  const points = history
    .map((v, i) => {
      const x = (i / Math.max(history.length - 1, 1)) * 100
      const y = 100 - (v / maxVal) * 100
      return `${x},${y}`
    })
    .join(" ")

  return (
    <div className="relative" aria-label="对齐度历史折线">
      <svg viewBox="0 0 100 100" className="w-full h-10" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke="#10b981"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between text-[8px] text-zinc-600 mt-0.5">
        <span>T-{history.length}</span>
        <span>T-0</span>
      </div>
    </div>
  )
}

// ─── 子组件：详情弹窗 ─────────────────────────────────────────────────

function ProposalDetailModal({
  p,
  onClose,
  onAction,
  actionState,
}: {
  p: EvolutionProposalItem
  onClose: () => void
  onAction: (action: "adopt" | "reject", reason?: string) => void
  actionState: ActionState
}) {
  const [rejectReason, setRejectReason] = useState("")
  const [showRejectInput, setShowRejectInput] = useState(false)

  const isActionable = p.status === "draft" || p.status === "pending"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-label={`提案 ${p.proposalId} 详情`}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-[420px] max-h-[80vh] overflow-auto p-4 space-y-3 shadow-2xl">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 font-mono">{p.proposalId}</span>
            <Badge
              variant={STATUS_BADGE[p.status]?.variant ?? "outline"}
              className="text-[9px] h-4 px-1"
            >
              {STATUS_BADGE[p.status]?.label ?? p.status}
            </Badge>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-sm" aria-label="关闭">
            ✕
          </button>
        </div>

        {/* 触发条件 */}
        <section>
          <h4 className="text-[10px] text-zinc-500 mb-1 font-medium">触发条件</h4>
          <p className="text-[11px] text-zinc-300 bg-zinc-950/80 rounded px-2.5 py-1.5 border border-zinc-800/60">
            {p.triggerReason || "无触发条件"}
          </p>
        </section>

        {/* 完整内容 */}
        <section>
          <h4 className="text-[10px] text-zinc-500 mb-1 font-medium">问题陈述</h4>
          <p className="text-[11px] text-zinc-300 leading-relaxed">
            {p.problemStatement || "无详细陈述"}
          </p>
        </section>

        <section>
          <h4 className="text-[10px] text-zinc-500 mb-1 font-medium">预计影响</h4>
          <p className="text-[11px] text-zinc-400">{p.estimatedImpact || "未评估"}</p>
        </section>

        <section>
          <h4 className="text-[10px] text-zinc-500 mb-1 font-medium">回滚计划</h4>
          <p className="text-[11px] text-zinc-400">{p.rollbackPlan || "无"}</p>
        </section>

        {/* 证据列表 */}
        {p.evidence && p.evidence.length > 0 && (
          <section>
            <h4 className="text-[10px] text-zinc-500 mb-1 font-medium">
              支撑证据 ({p.evidence.length})
            </h4>
            <div className="space-y-1 max-h-24 overflow-auto">
              {p.evidence.slice(0, 5).map((e, i) => (
                <p key={i} className="text-[10px] text-zinc-500 truncate border-l-2 border-zinc-700 pl-2">
                  {typeof e === "string" ? e.slice(0, 120) : JSON.stringify(e).slice(0, 120)}
                </p>
              ))}
            </div>
          </section>
        )}

        {/* 目标域 + 风险等级 */}
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <span className="text-zinc-500">目标域：</span>
            <span className="text-zinc-300 ml-1">
              {PROPOSAL_TYPE_LABELS[p.targetObjectType] ?? p.targetObjectType ?? p.targetComponent}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">风险等级：</span>
            <span className={`ml-1 ${RISK_COLORS[p.riskLevel] ?? "text-zinc-400"}`}>{p.riskLevel}</span>
          </div>
          <div>
            <span className="text-zinc-500">自动化：</span>
            <span className="text-zinc-300 ml-1">{p.automationLevel}</span>
          </div>
          <div>
            <span className="text-zinc-500">创建时间：</span>
            <span className="text-zinc-300 ml-1">
              {p.createdAt ? new Date(p.createdAt).toLocaleDateString("zh-CN") : "-"}
            </span>
          </div>
        </div>

        {/* 操作按钮 */}
        {isActionable && (
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            {showRejectInput ? (
              <div className="space-y-2">
                <textarea
                  className="w-full bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1.5 text-[11px] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-red-500/50"
                  rows={2}
                  placeholder="请输入拒绝原因..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-[10px] flex-1"
                    onClick={() => {
                      if (!rejectReason.trim()) return
                      onAction("reject", rejectReason)
                    }}
                    disabled={actionState === "loading" || !rejectReason.trim()}
                  >
                    {actionState === "loading" ? "处理中..." : "确认拒绝"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px]"
                    onClick={() => setShowRejectInput(false)}
                  >
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 text-[10px] flex-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                  onClick={() => onAction("adopt")}
                  disabled={actionState === "loading"}
                >
                  {actionState === "loading" ? "处理中..." : "采纳"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-[10px] flex-1"
                  onClick={() => setShowRejectInput(true)}
                  disabled={actionState === "loading"}
                >
                  拒绝
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 审批人信息 */}
        {p.reviewedBy && (
          <p className="text-[10px] text-zinc-500 pt-1 border-t border-zinc-800">
            审批人: <span className="text-zinc-300">{p.reviewedBy}</span>
            {p.reviewedAt && ` · ${new Date(p.reviewedAt).toLocaleDateString("zh-CN")}`}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── 子组件：提案行 ────────────────────────────────────────────────────

function ProposalRow({
  p,
  onViewDetail,
}: {
  p: EvolutionProposalItem
  onViewDetail: () => void
}) {
  const typeLabel = PROPOSAL_TYPE_LABELS[p.targetObjectType] ?? p.targetObjectType

  return (
    <div
      className="flex items-start justify-between px-2 py-1.5 rounded bg-zinc-900/50 border border-zinc-800/60 hover:border-zinc-700/60 transition-colors cursor-pointer"
      onClick={onViewDetail}
      role="listitem"
      aria-label={`提案 ${p.proposalId}: ${p.problemStatement}`}
    >
      <div className="min-w-0 flex-1 mr-2">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[9px] text-zinc-500 font-mono">{p.proposalId}</span>
          <span className="text-[10px] text-zinc-400">{typeLabel}</span>
          <span className={`text-[9px] ${RISK_COLORS[p.riskLevel] ?? "text-zinc-500"}`}>
            {p.riskLevel}
          </span>
        </div>
        <p className="text-[10px] text-zinc-300 truncate leading-tight">
          {p.problemStatement}
        </p>
      </div>
      <Badge
        variant={STATUS_BADGE[p.status]?.variant ?? "outline"}
        className="text-[9px] h-4 px-1 shrink-0"
      >
        {STATUS_BADGE[p.status]?.label ?? p.status}
      </Badge>
    </div>
  )
}

// ─── 子组件：审批签名区 ────────────────────────────────────────────────

function ApprovalSignatureBlock({
  signature,
}: {
  signature: { actor: string; action: string; createdAt: string; proposalTitle?: string } | null
}) {
  if (!signature) {
    return <p className="text-[10px] text-zinc-600 italic">暂无审批记录</p>
  }

  const isApproval = signature.action.includes("approve")

  return (
    <div
      className={`border rounded px-2.5 py-1.5 text-[10px] ${
        isApproval ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"
      }`}
      aria-label="最近审批签名"
    >
      <div className="flex items-center justify-between">
        <span className={isApproval ? "text-emerald-400" : "text-red-400"}>
          {isApproval ? "✓ 已批准" : "✗ 已拒绝"}
        </span>
        <span className="text-zinc-500 font-mono">
          {new Date(signature.createdAt).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <p className="text-zinc-400 mt-0.5 truncate">
        审批人: <span className="text-zinc-300">{signature.actor}</span>
      </p>
      {signature.proposalTitle && (
        <p className="text-zinc-500 truncate mt-0.5">{signature.proposalTitle}</p>
      )}
    </div>
  )
}

// ─── 主组件 ────────────────────────────────────────────────────────────

export function Panel5EvolutionCore() {
  const {
    dna,
    proposals,
    pendingCount,
    totalCount,
    latestSignature,
    alignmentHistory,
    isLoading,
    error,
    refresh,
    approvalCenterUrl,
  } = useEvolutionProposals()

  // ─── 本地状态 ──────────────────────────────────────────────────
  const [detailProposal, setDetailProposal] = useState<EvolutionProposalItem | null>(null)
  const [actionState, setActionState] = useState<ActionState>("idle")

  // 跳转审批中心
  const handleJumpToApproval = (proposalId: string) => {
    window.open(`${approvalCenterUrl}&proposal=${proposalId}`, "_blank")
  }

  // ─── 打开详情弹窗 + 审计埋点 ───────────────────────────────
  const handleViewDetail = useCallback((p: EvolutionProposalItem) => {
    setDetailProposal(p)
    setActionState("idle")
    // 审计埋点：proposal.view（fire-and-forget，不阻塞弹窗渲染）
    fetch("/api/v1/evolution/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId: p.proposalId }),
    }).catch(() => { /* 静默 */ })
  }, [])
  const handleAction = useCallback(
    async (action: "adopt" | "reject", reason?: string) => {
      if (!detailProposal) return
      setActionState("loading")

      try {
        const endpoint = action === "adopt"
          ? "/api/v1/evolution/adopt"
          : "/api/v1/evolution/reject"

        const body = action === "adopt"
          ? JSON.stringify({ proposalId: detailProposal.proposalId })
          : JSON.stringify({ proposalId: detailProposal.proposalId, reason })

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })

        const json = await res.json().catch(() => ({ success: false }))

        if (res.ok && json.success) {
          setActionState("success")
          setDetailProposal(null)
          // 刷新列表
          refresh()
        } else {
          setActionState("error")
        }
      } catch {
        setActionState("error")
      }
    },
    [detailProposal, refresh],
  )

  // 分类提案：待处理优先
  const sortedProposals = useMemo(() => {
    const priorityOrder: Record<string, number> = {
      pending: 0,
      draft: 1,
      approved: 2,
      implemented: 3,
      rejected: 4,
      "rolled-back": 5,
    }
    return [...proposals]
      .sort(
        (a, b) => (priorityOrder[a.status] ?? 9) - (priorityOrder[b.status] ?? 9),
      )
      .slice(0, MAX_VISIBLE_PROPOSALS)
  }, [proposals])

  // 加载骨架
  if (isLoading && proposals.length === 0) {
    return (
      <Card className="h-full border-zinc-800 bg-zinc-950/60 flex flex-col" aria-label="人机进化核心面板">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300">
            <Skeleton className="h-4 w-28 bg-zinc-800" />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-3 pt-0">
          <Skeleton className="h-10 w-full bg-zinc-800 rounded" />
          <Skeleton className="h-20 w-full bg-zinc-800 rounded" />
          <Skeleton className="h-32 w-full bg-zinc-800 rounded" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="h-full border-zinc-800 bg-zinc-950/60 flex flex-col" aria-label="人机进化核心面板">
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-sm font-medium text-zinc-300 flex items-center justify-between">
            <span>人机进化核心</span>
            <div className="flex items-center gap-2">
              {error && (
                <button
                  onClick={refresh}
                  className="text-[10px] text-amber-400 hover:text-amber-300 underline"
                  title="重试加载"
                >
                  重试
                </button>
              )}
              <span className="text-[10px] text-emerald-400 font-mono" aria-label={`进化代数 ${dna.generation}`}>
                GEN-{dna.generation}
              </span>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 space-y-3 overflow-auto pt-0">
          {/* 错误提示 */}
          {error && proposals.length === 0 && (
            <div className="border border-red-500/20 bg-red-500/5 rounded px-2 py-1.5 text-[10px] text-red-400">
              {error}
            </div>
          )}

          {/* 进化 DNA 指标 */}
          <section aria-label="进化DNA指标">
            <h4 className="text-[11px] text-zinc-500 mb-1.5">进化 DNA</h4>
            <div className="space-y-1.5">
              <DnaGauge label="决策对齐度" value={dna.decisionAlignment} />
              <DnaGauge label="权重稳定性" value={dna.weightStability} />
              <DnaGauge label="策略有效性" value={dna.policyEffectiveness} />
            </div>
          </section>

          {/* 对齐度折线 */}
          <section aria-label="对齐度历史">
            <h4 className="text-[11px] text-zinc-500 mb-1.5">
              对齐度趋势 {alignmentHistory.length > 0 && `(${alignmentHistory.length})`}
            </h4>
            <AlignmentChart history={alignmentHistory} />
          </section>

          {/* 提案状态摘要 */}
          <section aria-label="提案状态摘要">
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-[11px] text-zinc-500">
                进化提案 ({sortedProposals.length}/{totalCount})
              </h4>
              <div className="flex items-center gap-2">
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-amber-500/10 text-amber-400 border-amber-500/20">
                    {pendingCount} 待审批
                  </Badge>
                )}
              </div>
            </div>

            {sortedProposals.length === 0 ? (
              <p className="text-[10px] text-zinc-600 italic">暂无进化提案</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-auto" role="list">
                {sortedProposals.map((p) => (
                  <ProposalRow
                    key={p.proposalId}
                    p={p}
                    onViewDetail={() => handleViewDetail(p)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* 跳转审批中心 */}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-[10px] border-zinc-700 text-zinc-400 hover:bg-zinc-800/50"
            onClick={() => window.open(approvalCenterUrl, "_blank")}
            aria-label="跳转到审批中心"
          >
            → 审批中心
          </Button>

          {/* 最近审批签名 */}
          <section aria-label="最近审批签名">
            <h4 className="text-[11px] text-zinc-500 mb-1.5">最近审批</h4>
            <ApprovalSignatureBlock signature={latestSignature} />
          </section>

          {/* ─── 最近执行证据（v3.43 新增） ────────────────────────────── */}
          <section aria-label="最近执行证据">
            <h4 className="text-[11px] text-zinc-500 mb-1.5">执行证据</h4>
            {proposals.filter((p) => p.status === "approved" || p.status === "implemented").length === 0 ? (
              <p className="text-[10px] text-zinc-600 italic">暂无执行记录</p>
            ) : (
              <div className="space-y-1 max-h-24 overflow-auto">
                {proposals
                  .filter((p) => p.status === "approved" || p.status === "implemented")
                  .slice(0, 4)
                  .map((p) => (
                    <div
                      key={p.proposalId}
                      className="flex items-start justify-between px-2 py-1 rounded bg-zinc-900/50 border border-zinc-800/60 text-[10px]"
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-500 font-mono text-[9px]">{p.proposalId}</span>
                          <span className={p.status === "implemented" ? "text-emerald-400" : "text-blue-400"}>
                            {p.status === "implemented" ? "已实现" : "已批准"}
                          </span>
                        </div>
                        <p className="text-zinc-400 truncate">{p.problemStatement.slice(0, 40)}</p>
                      </div>
                      <span className="text-zinc-600 shrink-0">
                        {p.implementedAt
                          ? new Date(p.implementedAt).toLocaleDateString("zh-CN")
                          : p.reviewedAt
                            ? new Date(p.reviewedAt).toLocaleDateString("zh-CN")
                            : "-"}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </CardContent>
      </Card>

      {/* 提案详情弹窗 */}
      {detailProposal && (
        <ProposalDetailModal
          p={detailProposal}
          onClose={() => setDetailProposal(null)}
          onAction={handleAction}
          actionState={actionState}
        />
      )}
    </>
  )
}

// ─── 内部组件：DNA 指标条 ──────────────────────────────────────────────

function DnaGauge({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"
  const textColor = pct >= 70 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400"

  return (
    <div className="flex items-center justify-between text-[10px]" aria-label={`${label}: ${pct}%`}>
      <span className="text-zinc-500 w-16 shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 flex-1 ml-2">
        <div className="h-1.5 flex-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`font-mono w-7 text-right ${textColor}`}>{pct}%</span>
      </div>
    </div>
  )
}

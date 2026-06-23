/**
 * Panel5EvolutionCore — 人机进化核心面板 (P5)
 *
 * Phase 5 升级：接入进化闭环。
 * - GEN-N 代数 + 待审批计数
 * - 对齐度折线（最近 20 点）
 * - 权重修正日志
 * - 提案列表（限制 WorkflowTemplate / SkillBinding / EvalRuleSet / MemoryPolicy）
 * - 最近审批人签名区
 *
 * 治理边界：所有审批动作只跳转审批中心，不允许直接批准。
 * Proposal 默认 draft，不可自动激活。
 */
"use client"

import React, { useMemo } from "react"
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

// ─── 子组件：提案行 ────────────────────────────────────────────────────

function ProposalRow({ p, onJump }: { p: EvolutionProposalItem; onJump: () => void }) {
  const typeLabel = PROPOSAL_TYPE_LABELS[p.targetObjectType] ?? p.targetObjectType

  return (
    <div
      className="flex items-start justify-between px-2 py-1.5 rounded bg-zinc-900/50 border border-zinc-800/60 hover:border-zinc-700/60 transition-colors cursor-pointer"
      onClick={onJump}
      role="listitem"
      aria-label={`提案 ${p.proposalId}: ${p.problemStatement}`}
    >
      <div className="min-w-0 flex-1 mr-2">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] text-zinc-400 font-mono">{typeLabel}</span>
          <span className={`text-[9px] ${RISK_COLORS[p.riskLevel] ?? "text-zinc-500"}`}>
            {p.riskLevel}
          </span>
        </div>
        <p className="text-[10px] text-zinc-300 truncate leading-tight">
          {p.problemStatement}
        </p>
        {p.reviewedBy && (
          <p className="text-[9px] text-zinc-500 mt-0.5">
            审批: {p.reviewedBy}
            {p.reviewedAt && ` · ${new Date(p.reviewedAt).toLocaleDateString("zh-CN")}`}
          </p>
        )}
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

  // 跳转审批中心
  const handleJumpToApproval = (proposalId: string) => {
    window.open(`${approvalCenterUrl}&proposal=${proposalId}`, "_blank")
  }

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
    return [...proposals].sort(
      (a, b) => (priorityOrder[a.status] ?? 9) - (priorityOrder[b.status] ?? 9),
    )
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
            <h4 className="text-[11px] text-zinc-500">进化提案</h4>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-amber-500/10 text-amber-400 border-amber-500/20">
                  {pendingCount} 待审批
                </Badge>
              )}
              <span className="text-[10px] text-zinc-600">共 {totalCount}</span>
            </div>
          </div>

          {sortedProposals.length === 0 ? (
            <p className="text-[10px] text-zinc-600 italic">暂无进化提案</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-auto" role="list">
              {sortedProposals.slice(0, 8).map((p) => (
                <ProposalRow
                  key={p.proposalId}
                  p={p}
                  onJump={() => handleJumpToApproval(p.proposalId)}
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

        {/* 权重修正日志占位 */}
        <section aria-label="权重修正日志">
          <h4 className="text-[11px] text-zinc-500 mb-1.5">权重修正</h4>
          {proposals.filter((p) => p.status === "implemented").length === 0 ? (
            <p className="text-[10px] text-zinc-600 italic">暂无已实现的权重修正</p>
          ) : (
            <div className="space-y-0.5 max-h-16 overflow-auto">
              {proposals
                .filter((p) => p.status === "implemented")
                .slice(0, 4)
                .map((p) => (
                  <div key={p.proposalId} className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-400 truncate flex-1">{p.problemStatement}</span>
                    <span className="text-emerald-400 ml-2 shrink-0">
                      {p.implementedAt ? new Date(p.implementedAt).toLocaleDateString("zh-CN") : ""}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
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

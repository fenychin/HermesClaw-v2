"use client"

import { memo, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Sparkles,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  PlusCircle,
  ChevronRight,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { PanelContainer } from "./panel-container"

// ============================================================
// Panel 数据投影类型（从 HarnessProposal API 返回中提取）
// ============================================================

interface ProposalItem {
  id: string
  proposalId: string
  problemStatement: string
  proposedChange?: {
    targetComponent?: string
    description?: string
    riskLevel?: "low" | "medium" | "high" | "critical"
    automationLevel?: string
  }
  status: string
  requiresHumanApproval: boolean
  createdAt: string
}

interface ProposalsApiResponse {
  success: boolean
  data?: ProposalItem[]
  error?: string
}

// ============================================================
// 风险等级样式映射（提取到外部确保引用稳定）
// ============================================================

const RISK_STYLE: Record<string, { badge: string; text: string }> = {
  low:      { badge: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20", text: "低风险" },
  medium:   { badge: "bg-amber-400/10 text-amber-400 border-amber-400/20", text: "中风险" },
  high:     { badge: "bg-orange-400/10 text-orange-400 border-orange-400/20", text: "高风险" },
  critical: { badge: "bg-red-400/10 text-red-400 border-red-400/20", text: "严重" },
}

// ============================================================
// 单个提案卡片（memo 隔离）
// ============================================================

const ProposalCard = memo(function ProposalCard({
  proposal,
  onApprove,
  onReject,
  isPending,
}: {
  proposal: ProposalItem
  onApprove: (id: string) => void
  onReject: (id: string) => void
  isPending: boolean
}) {
  const riskLevel = proposal.proposedChange?.riskLevel ?? "low"
  const riskMeta = RISK_STYLE[riskLevel] ?? RISK_STYLE.low
  const target = proposal.proposedChange?.targetComponent ?? "Harness"
  const actionDesc = proposal.proposedChange?.description ?? proposal.problemStatement

  return (
    <div className="bg-background/40 border border-border/50 rounded-xl p-3 space-y-2">
      {/* 头部：提案 ID + 风险等级 */}
      <div className="flex items-center gap-2 justify-between">
        <span className="text-[10px] font-mono text-hint">
          {proposal.proposalId}
        </span>
        <span
          className={cn(
            "text-[9px] font-semibold px-1.5 py-0.5 rounded border",
            riskMeta.badge,
          )}
        >
          {riskMeta.text}
        </span>
      </div>

      {/* 目标组件 */}
      <p className="text-[10px] text-hint leading-tight">
        目标：<span className="text-foreground font-medium">{target}</span>
      </p>

      {/* 问题描述 */}
      <p className="text-foreground text-xs leading-relaxed line-clamp-2">
        {actionDesc}
      </p>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={isPending}
          onClick={() => onApprove(proposal.id)}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 h-7 text-[11px] font-medium rounded-lg transition-all",
            "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
            "hover:bg-emerald-500/20 hover:border-emerald-500/30",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          <CheckCircle className="size-3" />
          采纳
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => onReject(proposal.id)}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 h-7 text-[11px] font-medium rounded-lg transition-all",
            "bg-destructive/10 text-destructive border border-destructive/20",
            "hover:bg-destructive/20 hover:border-destructive/30",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          <XCircle className="size-3" />
          驳回
        </button>
      </div>
    </div>
  )
})

// ============================================================
// Panel 1 主组件：今日 AI 建议
// ============================================================

export function AiSuggestionsPanel() {
  const router = useRouter()
  const queryClient = useQueryClient()

  // ── 查询待审批提案 ──
  const {
    data: proposals,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ProposalItem[]>({
    queryKey: ["dashboard-proposals"],
    queryFn: async () => {
      const res = await fetch("/api/harness/proposals?status=draft")
      if (!res.ok) {
        const text = await res.text().catch(() => "未知错误")
        throw new Error(`获取提案失败 (${res.status}): ${text.slice(0, 100)}`)
      }
      const json: ProposalsApiResponse = await res.json()
      if (!json.success) {
        throw new Error(json.error ?? "获取提案失败")
      }
      const items = Array.isArray(json.data) ? json.data.slice(0, 3) : []
      return items
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 2,
  })

  // ── 采纳 mutation ──
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/harness/proposals/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "审批请求失败" }))
        throw new Error((json as any).error ?? `审批失败 (${res.status})`)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-proposals"] })
    },
  })

  // ── 驳回 mutation ──
  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/harness/proposals/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "驳回请求失败" }))
        throw new Error((json as any).error ?? `驳回失败 (${res.status})`)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-proposals"] })
    },
  })

  const isMutating = approveMutation.isPending || rejectMutation.isPending
  const mutationError = approveMutation.error?.message ?? rejectMutation.error?.message

  const handleApprove = useCallback(
    (id: string) => approveMutation.mutate(id),
    [approveMutation],
  )
  const handleReject = useCallback(
    (id: string) => rejectMutation.mutate(id),
    [rejectMutation],
  )
  const handleGenerate = useCallback(() => {
    router.push("/approvals")
  }, [router])

  // ── 状态 1：加载中 ──
  if (isLoading) {
    return (
      <PanelContainer
        title="今日 AI 建议"
        icon={<Sparkles className="size-4 text-primary" />}
      >
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-background/40 border border-border/50 rounded-xl p-3 space-y-2 animate-pulse">
              <div className="flex justify-between">
                <div className="h-3 w-20 bg-accent rounded" />
                <div className="h-4 w-12 bg-accent rounded-full" />
              </div>
              <div className="h-3 w-full bg-accent rounded" />
              <div className="h-8 w-full bg-accent/50 rounded-lg" />
            </div>
          ))}
        </div>
      </PanelContainer>
    )
  }

  // ── 状态 2：错误 ──
  if (isError) {
    return (
      <PanelContainer
        title="今日 AI 建议"
        icon={<AlertCircle className="size-4 text-destructive" />}
      >
        <div className="space-y-2 py-2">
          <p className="text-destructive text-xs leading-relaxed">
            {error instanceof Error ? error.message : "提案引擎暂不可用"}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 text-brand text-[11px] hover:underline"
          >
            <RefreshCw className="size-3" />
            点击重试
          </button>
        </div>
      </PanelContainer>
    )
  }

  // ── 状态 3：空（无待审批提案）─
  if (!proposals || proposals.length === 0) {
    return (
      <PanelContainer
        title="今日 AI 建议"
        icon={<Sparkles className="size-4 text-hint" />}
      >
        <div className="space-y-3 py-2">
          <p className="text-hint text-xs">暂无待审批的 Harness 提案</p>
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            当系统评估引擎检测到优化机会时，会自动在此生成提案。
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
          >
            <PlusCircle className="size-3.5" />
            前往审批中心创建提案
            <ChevronRight className="size-3" />
          </button>
        </div>
      </PanelContainer>
    )
  }

  // ── 状态 4：正常展示 ──
  return (
    <PanelContainer
      title="今日 AI 建议"
      icon={<Sparkles className="size-4 text-primary" />}
      actions={
        <button
          type="button"
          onClick={() => refetch()}
          className="text-hint hover:text-muted-foreground transition-colors"
          title="刷新"
        >
          <RefreshCw className="size-3" />
        </button>
      }
    >
      {/* Mutation 错误提示 */}
      {mutationError && (
        <div className="mb-2 text-[10px] text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-2 py-1">
          操作失败：{mutationError}
        </div>
      )}

      <div className="space-y-2.5">
        {proposals.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            onApprove={handleApprove}
            onReject={handleReject}
            isPending={isMutating}
          />
        ))}
      </div>

      {/* 底部：查看全部 */}
      <button
        type="button"
        onClick={() => router.push("/approvals")}
        className="mt-3 w-full text-[10px] text-hint hover:text-muted-foreground transition-colors flex items-center justify-center gap-1"
      >
        查看全部提案
        <ChevronRight className="size-3" />
      </button>
    </PanelContainer>
  )
}

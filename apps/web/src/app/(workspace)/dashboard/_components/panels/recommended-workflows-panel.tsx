"use client"

import { memo, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Workflow,
  Play,
  Loader2,
  AlertCircle,
  RefreshCw,
  PlusCircle,
  Layers,
  ChevronRight,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { PanelContainer } from "./panel-container"

// ============================================================
// Panel 数据投影类型
// ============================================================

interface WorkflowItem {
  id: string
  name: string
  description: string
  status: string
  nodeCount: number
  industryId: string | null
  templateId: string | null
  createdAt: string
  updatedAt: string
}

interface WorkflowsApiResponse {
  success: boolean
  data?: {
    workflows: WorkflowItem[]
    total: number
  }
  error?: string
}

// ============================================================
// 单个工作流卡片（memo 隔离）
// ============================================================

const WorkflowCard = memo(function WorkflowCard({
  wf,
  onRun,
  isRunning,
}: {
  wf: WorkflowItem
  onRun: (id: string) => void
  isRunning: boolean
}) {
  return (
    <div className="bg-background/40 border border-border/50 rounded-xl p-3 space-y-2">
      {/* 标题 */}
      <p className="text-foreground text-xs font-medium leading-tight">
        {wf.name}
      </p>

      {/* 描述 */}
      {wf.description && (
        <p className="text-hint text-[11px] leading-relaxed line-clamp-2">
          {wf.description}
        </p>
      )}

      {/* 元数据行 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[10px] text-hint bg-accent/50 px-1.5 py-0.5 rounded">
          <Layers className="size-2.5" />
          {wf.nodeCount} 步骤
        </span>
        {wf.industryId && (
          <span className="text-[10px] text-hint bg-accent/50 px-1.5 py-0.5 rounded">
            {wf.industryId}
          </span>
        )}
        {wf.nodeCount > 0 && (
          <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            L2
          </span>
        )}
      </div>

      {/* 运行按钮 */}
      <button
        type="button"
        disabled={isRunning}
        onClick={() => onRun(wf.id)}
        className={cn(
          "w-full inline-flex items-center justify-center gap-1.5 h-7 text-[11px] font-medium rounded-lg transition-all",
          "bg-primary/10 text-primary border border-primary/20",
          "hover:bg-primary/20 hover:border-primary/30",
          "disabled:opacity-40 disabled:cursor-not-allowed",
        )}
      >
        <Play className="size-3" />
        运行工作流
      </button>
    </div>
  )
})

// ============================================================
// Panel 2 主组件：推荐工作流
// ============================================================

interface RecommendedWorkflowsPanelProps {
  industryId?: string | null
}

export function RecommendedWorkflowsPanel({
  industryId,
}: RecommendedWorkflowsPanelProps) {
  const router = useRouter()
  const queryClient = useQueryClient()

  // ── 查询推荐工作流 ──
  const {
    data: result,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["dashboard-workflows", industryId ?? "_none_"],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (industryId) params.set("industryId", industryId)
      params.set("limit", "5")
      const res = await fetch(`/api/dashboard/workflows?${params.toString()}`)
      if (!res.ok) {
        const text = await res.text().catch(() => "未知错误")
        throw new Error(`获取工作流失败 (${res.status}): ${text.slice(0, 100)}`)
      }
      const json: WorkflowsApiResponse = await res.json()
      if (!json.success) {
        throw new Error(json.error ?? "获取工作流失败")
      }
      return json.data ?? { workflows: [], total: 0 }
    },
    staleTime: 60_000,
    retry: 2,
    enabled: !!industryId, // 没有 industryId 时不发请求
  })

  const workflows = result?.workflows ?? []

  // ── 运行 mutation ──
  const runMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      const res = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, inputs: {} }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "运行请求失败" }))
        throw new Error((json as any).error ?? `运行失败 (${res.status})`)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  const handleRun = useCallback(
    (id: string) => runMutation.mutate(id),
    [runMutation],
  )
  const handleCreateWorkflow = useCallback(() => {
    router.push("/workspace/workflows")
  }, [router])

  // ── 状态 0：未安装行业包 ──
  if (!industryId) {
    return (
      <PanelContainer
        title="推荐工作流"
        icon={<Workflow className="size-4 text-hint" />}
      >
        <div className="space-y-3 py-2">
          <p className="text-hint text-xs">
            安装 Industry Pack 后自动推荐适配工作流
          </p>
          <button
            type="button"
            onClick={() => router.push("/settings/industry-packs")}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
          >
            <PlusCircle className="size-3.5" />
            前往安装
            <ChevronRight className="size-3" />
          </button>
        </div>
      </PanelContainer>
    )
  }

  // ── 状态 1：加载中 ──
  if (isLoading) {
    return (
      <PanelContainer
        title="推荐工作流"
        icon={<Workflow className="size-4 text-muted-foreground" />}
      >
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-background/40 border border-border/50 rounded-xl p-3 space-y-2 animate-pulse">
              <div className="h-3 w-24 bg-accent rounded" />
              <div className="h-3 w-full bg-accent rounded" />
              <div className="flex gap-2">
                <div className="h-4 w-12 bg-accent rounded" />
                <div className="h-4 w-16 bg-accent rounded" />
              </div>
              <div className="h-7 w-full bg-accent/50 rounded-lg" />
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
        title="推荐工作流"
        icon={<AlertCircle className="size-4 text-destructive" />}
      >
        <div className="space-y-2 py-2">
          <p className="text-destructive text-xs leading-relaxed">
            {error instanceof Error ? error.message : "工作流列表加载失败"}
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

  // ── 状态 3：空 ──
  if (workflows.length === 0) {
    return (
      <PanelContainer
        title="推荐工作流"
        icon={<Workflow className="size-4 text-hint" />}
      >
        <div className="space-y-3 py-2">
          <p className="text-hint text-xs">
            暂无适配「{industryId}」行业的工作流
          </p>
          <button
            type="button"
            onClick={handleCreateWorkflow}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
          >
            <PlusCircle className="size-3.5" />
            创建工作流
            <ChevronRight className="size-3" />
          </button>
        </div>
      </PanelContainer>
    )
  }

  // ── 状态 4：正常展示 ──
  return (
    <PanelContainer
      title="推荐工作流"
      icon={<Workflow className="size-4 text-muted-foreground" />}
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
      {runMutation.error && (
        <div className="mb-2 text-[10px] text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-2 py-1">
          运行失败：{runMutation.error instanceof Error ? runMutation.error.message : "未知错误"}
        </div>
      )}

      <div className="space-y-2.5">
        {workflows.map((wf) => (
          <WorkflowCard
            key={wf.id}
            wf={wf}
            onRun={handleRun}
            isRunning={runMutation.isPending}
          />
        ))}
      </div>

      {/* 查看全部 */}
      <button
        type="button"
        onClick={() => router.push("/workspace/workflows")}
        className="mt-3 w-full text-[10px] text-hint hover:text-muted-foreground transition-colors flex items-center justify-center gap-1"
      >
        查看全部工作流
        <ChevronRight className="size-3" />
      </button>
    </PanelContainer>
  )
}

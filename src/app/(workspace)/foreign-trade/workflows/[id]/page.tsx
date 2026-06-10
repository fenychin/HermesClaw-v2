"use client";

import { useState, useEffect, use } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/empty-state";
import { WorkflowStepNav } from "../../_components/workflow-step-nav";
import { WorkflowExecutor } from "../../_components/workflow-executor";
import { WorkflowContextPanel } from "../../_components/workflow-context-panel";
import { getWorkflowById } from "../../_data/workflow-details";
import type { Workflow, WorkflowRunStatus } from "@/types/workflow";

// ============================================================
// 从 DB Workflow 定义中提取步骤结构
// ============================================================

interface DbWorkflow {
  id: string
  name: string
  description: string
  nodes: Array<{ id: string; name: string; kind: string; config: Record<string, unknown> }>
  edges: Array<{ from: string; to: string; when?: string }>
}

/**
 * 将 DB 中的 DAG 节点映射到用户可见的步骤
 * —— 每种 kind 生成一个步骤，按节点顺序排列
 */
function mapNodesToSteps(nodes: DbWorkflow["nodes"]) {
  return nodes
    .filter((n) => n.kind !== "condition" && n.kind !== "noop") // 条件/noop 节点不显示为步骤
    .map((n, i) => ({
      id: `step-${n.id}`,
      title: n.name,
      description: "",
      status: "pending" as const,
      inputs: buildStepInputs(n, i),
    }))
}

/** 按节点类型构建步骤输入字段 */
function buildStepInputs(
  node: DbWorkflow["nodes"][number],
  index: number,
): Array<{
  key: string
  label: string
  type: "text" | "textarea" | "select"
  required: boolean
  placeholder?: string
  options?: Array<{ label: string; value: string }>
}> {
  if (node.kind === "skill") {
    return [
      {
        key: `input_${node.id}_text`,
        label: "输入内容",
        type: "textarea" as const,
        required: true,
        placeholder: index === 0
          ? "粘贴询盘邮件原文 / 客户需求描述..."
          : "补充信息或调整指令...",
      },
    ]
  }
  // data-write / task 节点不需要用户输入
  return []
}

// ============================================================
// 客户端页面主体
// ============================================================

interface PageProps {
  params: Promise<{ id: string }>
}

export default function WorkflowDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const [dbWorkflow, setDbWorkflow] = useState<DbWorkflow | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 从 API 加载 DB 中的工作流定义
  useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      setLoadError(null)
      try {
        const res = await fetch(`/api/workflows/${id}`)
        if (!res.ok) {
          if (res.status === 404) {
            setDbWorkflow(null)
            return
          }
          throw new Error("加载工作流失败")
        }
        const json = await res.json()
        if (!json.success) throw new Error(json.error ?? "未知错误")
        if (!cancelled) setDbWorkflow(json.data as DbWorkflow)
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "加载失败")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  // 加载中状态
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">加载工作流...</span>
        </div>
      </div>
    )
  }

  // 加载失败
  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={GitBranch}
          title="加载失败"
          description={loadError}
        />
      </div>
    )
  }

  // DB 中无此工作流定义 → 回退到静态 mock 数据（兼容旧数据）
  if (!dbWorkflow) {
    const staticWorkflow = getWorkflowById(id)
    if (!staticWorkflow) {
      return (
        <div className="flex h-full items-center justify-center">
          <EmptyState
            icon={GitBranch}
            title="工作流不存在"
            description={`未找到 ID 为「${id}」的工作流，请返回外贸工作台重新选择。`}
          />
        </div>
      )
    }
    // 使用静态 mock 数据（兼容：无 DB 记录的旧工作流）
    return (
      <StaticWorkflowPage workflow={staticWorkflow} />
    )
  }

  // 使用 DB 工作流定义
  return <DbWorkflowPage dbWorkflow={dbWorkflow} workflowId={id} />
}

// ============================================================
// DB 驱动的工作流页面（真实后端执行）
// ============================================================

function DbWorkflowPage({
  dbWorkflow,
  workflowId,
}: {
  dbWorkflow: DbWorkflow
  workflowId: string
}) {
  const [runStatus, setRunStatus] = useState<WorkflowRunStatus>("idle")
  const dagNodes = dbWorkflow.nodes.filter((n) => n.kind !== "condition" && n.kind !== "noop")

  // 将 DB 节点映射为 Workflow 类型（供 executor 使用）
  const steps = mapNodesToSteps(dbWorkflow.nodes)
  const workflow: Workflow = {
    id: workflowId,
    title: dbWorkflow.name,
    description: dbWorkflow.description,
    runStatus,
    steps,
  }

  // 轮询：当 runStatus 为 running 时，超时 fallback（执行在 WorkflowExecutor 内部完成）
  useEffect(() => {
    if (runStatus === "running") {
      // 给一个小延迟让 executor 内的 API 调用先完成
      // executor 成功后会通过 onRun 回调通知
      // 这里作为 fallback，3s 后自动重置
      const timer = setTimeout(() => {
        setRunStatus((prev) => (prev === "running" ? "idle" : prev))
      }, 30000)
      return () => clearTimeout(timer)
    }
  }, [runStatus])

  // 暴露 setRunStatus 给子组件
  const handleWorkflowComplete = () => {
    setRunStatus("completed")
  }

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
        {/* 左栏：步骤导航 */}
        <WorkflowStepNav workflow={workflow} onRestart={() => setRunStatus("idle")} />

        {/* 中栏：工作流执行区 */}
        <main className="flex-1 min-w-0 h-full overflow-hidden">
          <WorkflowExecutor
            workflow={workflow}
            runStatus={runStatus}
            dagNodes={dagNodes}
            onRun={handleWorkflowComplete}
          />
        </main>

        {/* 右栏：上下文配置面板 */}
        <WorkflowContextPanel />
      </div>
    </PageTransition>
  )
}

// ============================================================
// 静态工作流页面（兼容无 DB 记录的旧工作流）
// ============================================================

function StaticWorkflowPage({ workflow }: { workflow: Workflow }) {
  const [runStatus, setRunStatus] = useState<WorkflowRunStatus>("idle")

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
        {/* 左栏 */}
        <WorkflowStepNav workflow={workflow} onRestart={() => setRunStatus("idle")} />

        {/* 中栏：使用真实 API 执行，传递空 DAG */}
        <main className="flex-1 min-w-0 h-full overflow-hidden">
          <WorkflowExecutor
            workflow={workflow}
            runStatus={runStatus}
            dagNodes={[]}
            onRun={() => setRunStatus("completed")}
          />
        </main>

        {/* 右栏 */}
        <WorkflowContextPanel />
      </div>
    </PageTransition>
  )
}

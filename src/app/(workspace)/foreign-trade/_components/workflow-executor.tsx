"use client";

import { useState } from "react";
import { Play, CheckCircle2, AlertCircle, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";
import { InputField } from "@/components/common/input-field";
import type {
  Workflow,
  WorkflowRunStatus,
} from "@/types/workflow";

// ============================================================
// 类型定义
// ============================================================

/** API 返回的工作流执行结果 */
interface RunResult {
  runId: string
  status: string
  output: Record<string, unknown> | null
}

/** 工作流输入值（key → value） */
type InputValues = Record<string, string>

/** 单个节点的结果 */
interface NodeResult {
  nodeId: string
  nodeName: string
  status: "completed" | "failed" | "skipped"
  output: unknown
}

// ============================================================
// 运行状态 Badge
// ============================================================

function RunStatusBadge({ status }: { status: WorkflowRunStatus }) {
  const config: Record<
    WorkflowRunStatus,
    { label: string; className: string }
  > = {
    idle: {
      label: "待运行",
      className: "bg-border/40 text-muted-foreground",
    },
    running: {
      label: "运行中",
      className: "bg-primary/15 text-primary",
    },
    completed: {
      label: "已完成",
      className: "bg-success/15 text-success",
    },
    failed: {
      label: "执行失败",
      className: "bg-danger/15 text-danger",
    },
  };

  const { label, className } = config[status];
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", className)}>
      {label}
    </span>
  );
}

// ============================================================
// 加载动画
// ============================================================

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2 rounded-full bg-primary animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
      <span className="text-hint text-xs ml-1">正在通过 AI 执行...</span>
    </div>
  );
}

// ============================================================
// 已完成节点结果卡片
// ============================================================

function NodeResultCard({ nodeResult }: { nodeResult: NodeResult }) {
  const [expanded, setExpanded] = useState(false)

  if (nodeResult.status === "skipped") {
    return (
      <div className="bg-card/50 rounded-xl border border-border/60 p-3 mb-2 opacity-60">
        <span className="text-hint text-xs">{nodeResult.nodeName} — 已跳过</span>
      </div>
    )
  }

  if (nodeResult.status === "failed") {
    return (
      <div className="bg-card rounded-xl border border-danger/30 p-3 mb-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-3.5 text-danger shrink-0" />
          <span className="text-foreground text-xs font-medium">{nodeResult.nodeName}</span>
          <span className="text-danger text-xs ml-auto">失败</span>
        </div>
        {typeof nodeResult.output === "object" && nodeResult.output !== null && (
          <p className="text-muted-foreground text-xs mt-1">
            {(nodeResult.output as Record<string, unknown>).error as string ?? "未知错误"}
          </p>
        )}
      </div>
    )
  }

  const output = nodeResult.output as Record<string, unknown> | null
  const result = (output?.result as Record<string, unknown>) ?? output
  const summary = output?.summary as string ?? ""
  const confidence = output?.confidence as number | undefined
  const meta = output?._meta as Record<string, unknown> | undefined

  return (
    <div className="bg-card rounded-xl border border-border p-3 mb-2">
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 className="size-3.5 text-success shrink-0" />
        <span className="text-foreground text-xs font-medium">{nodeResult.nodeName}</span>
        <span className="text-hint text-[10px] ml-auto">
          {meta?.duration ? `${meta.duration as string}` : ""}
        </span>
        {confidence !== undefined && (
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
              confidence >= 0.7 ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
            )}
          >
            {(confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {/* 摘要 */}
      {summary && (
        <p className="text-muted-foreground text-xs mb-1.5 leading-relaxed">{summary}</p>
      )}

      {/* 结构化结果（可展开） */}
      {result && typeof result === "object" && Object.keys(result).length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-primary text-[10px] hover:text-primary/80 transition-colors flex items-center gap-0.5"
          >
            <ChevronDown
              className={cn("size-3 transition-transform", expanded && "rotate-180")}
            />
            详细输出
          </button>
          {expanded && (
            <div className="mt-1.5 bg-background rounded-lg p-2.5 border border-border/50">
              {result.body && typeof result.body === "string" ? (
                <div className="text-foreground/85 text-xs whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                  <MarkdownRenderer content={result.body} />
                </div>
              ) : (
                <pre className="text-muted-foreground text-[11px] whitespace-pre-wrap">
                  {JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// WorkflowExecutor 主组件（真实后端驱动）
// ============================================================

interface WorkflowExecutorProps {
  workflow: Workflow
  runStatus: WorkflowRunStatus
  /** 从 DB 加载的 DAG 节点列表（用于映射输出结果到用户可见标签） */
  dagNodes: Array<{ id: string; name: string; kind: string }>
  onRun: () => void
}

export function WorkflowExecutor({
  workflow,
  runStatus,
  dagNodes,
  onRun,
}: WorkflowExecutorProps) {
  // 收集所有步骤的输入值
  const [inputValues, setInputValues] = useState<InputValues>({})
  // 执行结果（来自 API）
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  // 节点结果片段
  const [nodeResults, setNodeResults] = useState<NodeResult[]>([])
  // 执行状态
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 收集所有步骤的 inputs（展平）
  const allInputs = workflow.steps.flatMap((step) =>
    (step.inputs ?? []).map((inp) => ({ ...inp, stepId: step.id, stepTitle: step.title })),
  )

  // 检查必填项是否已填
  const requiredFilled = allInputs
    .filter((inp) => inp.required)
    .every((inp) => {
      const val = inputValues[inp.key]
      return val && val.trim().length > 0
    })

  // 更新输入值
  const handleInputChange = (key: string, value: string) => {
    setInputValues((prev) => ({ ...prev, [key]: value }))
  }

  // 构建 workfow run 输入（将步骤输入扁平化为 variables）
  const buildWorkflowInput = (): Record<string, unknown> => {
    const vars: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(inputValues)) {
      // 跳过空值
      if (value.trim().length > 0) {
        vars[key] = value
      }
    }
    return vars
  }

  // 执行工作流
  const handleExecute = async () => {
    if (!requiredFilled || isExecuting) return

    setIsExecuting(true)
    setError(null)
    setRunResult(null)
    setNodeResults([])

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60_000) // 60s 超时

    try {
      const input = buildWorkflowInput()
      const res = await fetch(`/api/workflows/${workflow.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      })

      // 安全解析 JSON：非 JSON 响应时取原始文本作为错误消息
      let json: { success?: boolean; error?: string; data?: RunResult }
      try {
        json = await res.json()
      } catch {
        const text = await res.text().catch(() => "（无法读取响应内容）")
        throw new Error(text.slice(0, 300))
      }

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "工作流执行失败")
      }

      const result: RunResult = json.data!
      setRunResult(result)

      // 将 DAG 节点输出映射为用户可见的节点结果卡片
      if (result.output && typeof result.output === "object") {
        const nodes: NodeResult[] = dagNodes.map((node) => {
          const nodeOutput = (result.output as Record<string, unknown>)[node.id]
          let status: NodeResult["status"] = "skipped"
          if (nodeOutput) {
            status = "completed"
          }
          return {
            nodeId: node.id,
            nodeName: node.name,
            status,
            output: nodeOutput ?? null,
          }
        })
        setNodeResults(nodes)
      }

      // 通知父组件状态变更
      onRun()
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("工作流执行超时，请稍后查看运行状态或重试")
      } else {
        setError(err instanceof Error ? err.message : "执行异常")
      }
    } finally {
      clearTimeout(timeoutId)
      setIsExecuting(false)
    }
  }

  // 重置执行
  const handleReset = () => {
    setRunResult(null)
    setNodeResults([])
    setError(null)
  }

  // 已运行完成
  const isCompleted = runResult?.status === "completed"
  const currentStatus: WorkflowRunStatus =
    isExecuting ? "running" : isCompleted ? "completed" : error ? "failed" : runStatus

  // 按步骤分组渲染输入区
  const groupedInputs = new Map<string, typeof allInputs>()
  for (const inp of allInputs) {
    const existing = groupedInputs.get(inp.stepId)
    if (existing) {
      existing.push(inp)
    } else {
      groupedInputs.set(inp.stepId, [inp])
    }
  }

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* ---- 顶部工具栏 ---- */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-border bg-card/30">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-foreground text-sm font-semibold truncate">
            {workflow.title}
          </h1>
          <RunStatusBadge status={currentStatus} />
        </div>
        {!isCompleted ? (
          <button
            type="button"
            onClick={handleExecute}
            disabled={!requiredFilled || isExecuting}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all",
              requiredFilled && !isExecuting
                ? "bg-primary text-white hover:bg-primary/90 active:scale-[0.97]"
                : "bg-border/40 text-hint cursor-not-allowed",
            )}
          >
            {isExecuting ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                执行中...
              </>
            ) : (
              <>
                <Play className="size-3 fill-white" />
                执行
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <RefreshCw className="size-3" />
            重新执行
          </button>
        )}
      </div>

      {/* ---- 主内容区 ---- */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* 空闲态：显示输入表单 */}
        {runStatus === "idle" && !isExecuting && !runResult && (
          <>
            {/* 工作流描述 */}
            {workflow.description && (
              <div className="bg-accent/20 rounded-xl p-3 mb-2">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {workflow.description}
                </p>
              </div>
            )}

            {/* 按步骤分组渲染输入 */}
            {Array.from(groupedInputs.entries()).map(([stepId, inputs]) => {
              const step = workflow.steps.find((s) => s.id === stepId)
              const stepIdx = workflow.steps.findIndex((s) => s.id === stepId)
              return (
                <div key={stepId} className="bg-card rounded-2xl border border-border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-hint text-[10px] font-semibold uppercase tracking-wider bg-accent/50 rounded-md px-1.5 py-0.5">
                      步骤 {stepIdx + 1}
                    </span>
                    <span className="text-foreground text-sm font-medium">
                      {step?.title ?? stepId}
                    </span>
                  </div>
                  {step?.description && (
                    <p className="text-hint text-xs mb-3">{step.description}</p>
                  )}
                  <div className="space-y-2.5">
                    {inputs.map((inp) => (
                      <InputField
                        key={inp.key}
                        input={inp}
                        value={inputValues[inp.key] ?? ""}
                        onChange={handleInputChange}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* 运行中态 */}
        {isExecuting && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="bg-primary/10 rounded-2xl p-4 mb-4">
              <Loader2 className="size-8 text-primary animate-spin" />
            </div>
            <p className="text-foreground text-sm font-medium">AI 正在执行工作流</p>
            <p className="text-hint text-xs mt-1">正在调用 LLM 处理您的输入，请稍候...</p>
            <ThinkingDots />
          </div>
        )}

        {/* 错误态 */}
        {error && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="bg-danger/10 rounded-2xl p-4 mb-4">
              <AlertCircle className="size-8 text-danger" />
            </div>
            <p className="text-foreground text-sm font-medium">执行失败</p>
            <p className="text-hint text-xs mt-1 max-w-xs text-center">{error}</p>
            <button
              type="button"
              onClick={handleReset}
              className="mt-4 bg-primary/10 text-primary px-4 py-2 rounded-xl text-xs font-medium hover:bg-primary/20 transition-colors"
            >
              重试
            </button>
          </div>
        )}

        {/* 完成态：显示每个节点的结果 */}
        {isCompleted && nodeResults.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="size-4 text-success" />
              <span className="text-foreground text-sm font-medium">执行完成</span>
              <span className="text-hint text-xs">
                · 运行 ID：{runResult?.runId.slice(0, 8)}...
              </span>
            </div>
            {nodeResults.map((nr) => (
              <NodeResultCard key={nr.nodeId} nodeResult={nr} />
            ))}
          </div>
        )}

        {/* 完成但无节点输出（后端可能只返回了空 output） */}
        {isCompleted && nodeResults.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="bg-success/10 rounded-2xl p-4 mb-4">
              <CheckCircle2 className="size-8 text-success" />
            </div>
            <p className="text-foreground text-sm font-medium">执行完成</p>
            <p className="text-hint text-xs mt-1">工作流已成功完成，运行 ID：{runResult?.runId.slice(0, 8)}...</p>
          </div>
        )}
      </div>
    </div>
  );
}

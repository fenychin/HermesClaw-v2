"use client";

import { useState, useEffect, useRef } from "react";
import { Play, CheckCircle2, AlertCircle, ChevronDown, Loader2, RefreshCw, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";
import { InputField } from "@/components/common/input-field";
import { toast } from "sonner";
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
    waiting: {
      label: "暂停等待人工",
      className: "bg-warning/15 text-warning border border-warning/20 font-semibold animate-pulse",
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
  const [checkpointId, setCheckpointId] = useState<string | null>(null)

  // 临时授权的缺失状态
  const [missingGrant, setMissingGrant] = useState<{
    agentId: string
    toolId: string
    scopes: string[]
    riskLevel: string
  } | null>(null)
  const [approver1, setApprover1] = useState("")
  const [approver2, setApprover2] = useState("")
  const [grantSubmitting, setGrantSubmitting] = useState(false)
  const [grantError, setGrantError] = useState<string | null>(null)

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // 清除定时器
  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }

  useEffect(() => {
    return () => stopPolling()
  }, [])

  // 轮询工作流最新状态
  const startPolling = (runId: string) => {
    stopPolling()
    setIsExecuting(true)
    setError(null)

    const poll = async () => {
      try {
        const res = await fetch(`/api/workflow-runs/${runId}/status`)
        if (!res.ok) throw new Error("获取运行状态失败")
        const json = await res.json()
        if (json.success) {
          const statusData = json.data
          const status = statusData.status

          setRunResult({
            runId,
            status,
            output: null
          })

          // 将 steps 数组映射为 NodeResult
          if (statusData.steps && Array.isArray(statusData.steps)) {
            const mappedNodes: NodeResult[] = dagNodes.map((node) => {
              const matchedStep = statusData.steps.find((s: any) => s.nodeId === node.id)
              let nodeStatus: NodeResult["status"] = "skipped"
              let nodeOutput: any = null

              if (matchedStep) {
                if (matchedStep.status === "completed") {
                  nodeStatus = "completed"
                  nodeOutput = matchedStep.outputData
                } else if (matchedStep.status === "failed") {
                  nodeStatus = "failed"
                  nodeOutput = { error: matchedStep.errorMessage || "步骤执行失败" }
                } else if (matchedStep.status === "skipped") {
                  nodeStatus = "skipped"
                }
              }

              return {
                nodeId: node.id,
                nodeName: node.name,
                status: nodeStatus,
                output: nodeOutput,
              }
            })
            // 只展示已经产生结果（已完成或已失败）的节点
            setNodeResults(mappedNodes.filter(n => n.status === "completed" || n.status === "failed"))
          }

          if (status === "completed") {
            stopPolling()
            setIsExecuting(false)
            onRun()
            toast.success("工作流执行已顺利完成！")
          } else if (status === "failed") {
            stopPolling()
            setIsExecuting(false)
            setError(statusData.errorMessage || "工作流执行失败")
          } else if (status === "cancelled") {
            stopPolling()
            setIsExecuting(false)
            setError("工作流已被取消")
          } else if (status === "waiting") {
            stopPolling()
            setIsExecuting(false)
            setCheckpointId(statusData.checkpointId)
            toast.info("工作流进入等待审批状态，请在界面处理")
          }
        }
      } catch (err) {
        console.error("轮询工作流状态异常:", err)
      }
    }

    poll()
    pollIntervalRef.current = setInterval(poll, 3000)
  }

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

  // 构建 variables 输入
  const buildWorkflowInput = (): Record<string, unknown> => {
    const vars: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(inputValues)) {
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
    setCheckpointId(null)

    try {
      const input = buildWorkflowInput()
      // 修复 404 URL 问题，改用正统 /api/workflows/run 端点
      const res = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: workflow.id,
          inputs: input
        }),
      })

      let json: { success?: boolean; error?: string; code?: string; data?: { runId: string; status: string }; details?: any }
      try {
        json = await res.json()
      } catch {
        const text = await res.text().catch(() => "（无法读取响应内容）")
        throw new Error(text.slice(0, 300))
      }

      if (!res.ok || !json.success) {
        if (json.code === "TOOL_GRANT_MISSING" && json.details) {
          const details = json.details as { agentId: string; toolId: string; scopes: string[]; riskLevel: string }
          setMissingGrant(details)
          throw new Error("工作流执行被拦截：当前智能体缺少所需的高危工具授权。")
        }
        throw new Error(json.error ?? "工作流执行失败")
      }

      const runId = json.data?.runId
      if (!runId) throw new Error("未获取到运行实例 ID")

      // 开启异步状态轮询
      startPolling(runId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "执行异常")
      setIsExecuting(false)
    }
  }

  // 重置执行
  const handleReset = () => {
    stopPolling()
    setRunResult(null)
    setNodeResults([])
    setError(null)
    setCheckpointId(null)
  }

  const isCompleted = runResult?.status === "completed"
  const isWaiting = runResult?.status === "waiting"
  const currentStatus: WorkflowRunStatus =
    isExecuting ? "running" : isWaiting ? "waiting" : isCompleted ? "completed" : error ? "failed" : runStatus

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
        {currentStatus === "idle" && !isExecuting && !runResult && (
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

        {/* 等待人工审批态 (human-in-loop) */}
        {currentStatus === "waiting" && checkpointId && (
          <div className="bg-warning/10 border border-warning/30 rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
            <div className="bg-warning/20 border border-warning/35 rounded-full p-3 animate-pulse">
              <Clock className="size-6 text-warning" />
            </div>
            <div className="space-y-1">
              <p className="text-foreground text-sm font-bold">暂停等待人工审批</p>
              <p className="text-hint text-xs">当前工作流节点需要业务人员审查并批准后才能继续执行后续操作。</p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <button
                type="button"
                onClick={async () => {
                  const toastId = toast.loading("正在提交拒绝决策...")
                  try {
                    const res = await fetch(`/api/approvals/${checkpointId}/decide`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ decision: "rejected", comment: "普通工作流节点拒绝" }),
                    })
                    const resData = await res.json()
                    if (!res.ok || !resData.success) throw new Error(resData.error || "提交决策失败")
                    toast.success("拒绝成功，工作流已终止", { id: toastId })
                    handleReset()
                  } catch (err: any) {
                    toast.error(`拒绝失败: ${err.message}`, { id: toastId })
                  }
                }}
                className="bg-danger/10 hover:bg-danger/20 text-danger border border-danger/25 font-semibold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer"
              >
                拒绝
              </button>
              <button
                type="button"
                onClick={async () => {
                  const toastId = toast.loading("正在提交批准决策...")
                  try {
                    const res = await fetch(`/api/approvals/${checkpointId}/decide`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ decision: "approved", comment: "普通工作流节点批准" }),
                    })
                    const resData = await res.json()
                    if (!res.ok || !resData.success) throw new Error(resData.error || "提交决策失败")
                    toast.success("审批通过！工作流将恢复继续执行", { id: toastId })
                    if (runResult) startPolling(runResult.runId)
                  } catch (err: any) {
                    toast.error(`审批失败: ${err.message}`, { id: toastId })
                  }
                }}
                className="bg-primary hover:bg-primary/95 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer"
              >
                批准并继续
              </button>
            </div>
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
              重置
            </button>
          </div>
        )}

        {/* 已运行节点结果展示（运行中/等待审批/已完成均可呈现当前进度轨迹） */}
        {(isExecuting || currentStatus === "waiting" || isCompleted) && nodeResults.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="size-4 text-success" />
              <span className="text-foreground text-sm font-medium">节点执行轨迹</span>
            </div>
            {nodeResults.map((nr) => (
              <NodeResultCard key={nr.nodeId} nodeResult={nr} />
            ))}
          </div>
        )}

        {/* 完成但无节点输出（后端只返回了空 output） */}
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

      {/* 临时授权 Dialog 弹窗 */}
      {missingGrant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md transition-opacity duration-300">
          <div className="bg-card/95 border border-border w-full max-w-md rounded-3xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
            {/* 渐变流光背景 */}
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-brand-blue/5 to-transparent pointer-events-none" />
            
            {/* 警告图标 */}
            <div className="flex items-center gap-3.5 mb-4 relative z-10">
              <div className="bg-warning/20 border border-warning/30 rounded-2xl p-2.5 shadow-inner">
                <AlertCircle className="text-warning size-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-foreground text-base font-bold">申请临时工具授权</h3>
                <p className="text-hint text-[11px] mt-0.5 font-medium">智能体执行高危操作，需经安全门禁人工确认</p>
              </div>
            </div>

            {/* 参数卡片 */}
            <div className="bg-background/80 border border-border/60 rounded-2xl p-4 space-y-2.5 text-xs mb-4 shadow-sm relative z-10">
              <div className="flex justify-between items-center">
                <span className="text-hint font-medium">智能体 (Agent):</span>
                <span className="text-foreground font-semibold font-mono bg-accent/40 rounded px-1.5 py-0.5 text-[11px]">{missingGrant.agentId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-hint font-medium">受控工具 (Tool):</span>
                <span className="text-foreground font-semibold font-mono bg-accent/40 rounded px-1.5 py-0.5 text-[11px]">{missingGrant.toolId}</span>
              </div>
              <div>
                <span className="text-hint font-medium block mb-1">要求权限范围 (Scopes):</span>
                <div className="flex flex-wrap gap-1">
                  {missingGrant.scopes.map((s, idx) => (
                    <span key={idx} className="text-[10px] bg-primary/10 text-primary font-medium px-1.5 py-0.5 rounded-md font-mono">{s}</span>
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center pt-1.5 border-t border-border/50">
                <span className="text-hint font-medium">工具风险级别:</span>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm",
                  missingGrant.riskLevel === "high" ? "bg-danger/15 text-danger border border-danger/30" : "bg-warning/15 text-warning border border-warning/30"
                )}>
                  {missingGrant.riskLevel === "high" ? "特高危 (需双签)" : "高危 (需单签)"}
                </span>
              </div>
            </div>

            {/* 错误提示 */}
            {grantError && (
              <div className="bg-danger/10 border border-danger/25 text-danger rounded-xl p-3 text-xs mb-4 relative z-10">
                {grantError}
              </div>
            )}

            {/* 输入框 */}
            <div className="space-y-3 mb-5 relative z-10">
              <div>
                <label className="text-foreground text-xs font-semibold block mb-1.5">
                  一级审批人签字 (姓名/邮箱) <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  placeholder="例如: admin@company.com"
                  value={approver1}
                  onChange={(e) => setApprover1(e.target.value)}
                  disabled={grantSubmitting}
                  className="w-full bg-background border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-3.5 py-2 text-xs text-foreground placeholder:text-hint outline-none transition-all"
                />
              </div>

              {missingGrant.riskLevel === "high" && (
                <div>
                  <label className="text-foreground text-xs font-semibold block mb-1.5">
                     二级联合审批人签字 (姓名/邮箱) <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="例如: manager@company.com"
                    value={approver2}
                    onChange={(e) => setApprover2(e.target.value)}
                    disabled={grantSubmitting}
                    className="w-full bg-background border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-3.5 py-2 text-xs text-foreground placeholder:text-hint outline-none transition-all"
                  />
                </div>
              )}
            </div>

            {/* 按钮 */}
            <div className="flex gap-2.5 justify-end relative z-10">
              <button
                type="button"
                onClick={() => {
                  setMissingGrant(null)
                  setGrantError(null)
                  setApprover1("")
                  setApprover2("")
                }}
                disabled={grantSubmitting}
                className="bg-accent hover:bg-accent/80 text-foreground font-medium px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!approver1.trim()) {
                    setGrantError("请填写一级审批人签字")
                    return
                  }
                  if (missingGrant.riskLevel === "high" && !approver2.trim()) {
                    setGrantError("高危工具必须提供二级审批人签字")
                    return
                  }
                  if (missingGrant.riskLevel === "high" && approver1.trim() === approver2.trim()) {
                    setGrantError("一级和二级审批人签字不能为同一人")
                    return
                  }

                  setGrantSubmitting(true)
                  setGrantError(null)
                  try {
                    const res = await fetch("/api/tools/grant", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        toolId: missingGrant.toolId,
                        agentId: missingGrant.agentId,
                        scopes: missingGrant.scopes,
                        approvedBy1: approver1,
                        approvedBy2: approver2 || undefined,
                      })
                    })

                    const json = await res.json()
                    if (!res.ok || !json.success) {
                      throw new Error(json.message || json.error || "签发临时授权失败")
                    }

                    // 授权成功：清除状态，自动重新运行！
                    setMissingGrant(null)
                    setApprover1("")
                    setApprover2("")
                    // 延迟重新触发执行，确保 DB 写入刷入
                    setTimeout(() => {
                      handleExecute()
                    }, 400)
                  } catch (err: any) {
                    setGrantError(err.message || "服务器发生异常")
                  } finally {
                    setGrantSubmitting(false)
                  }
                }}
                disabled={grantSubmitting || !approver1.trim() || (missingGrant.riskLevel === "high" && !approver2.trim())}
                className={cn(
                  "bg-primary text-white font-medium px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer",
                  "disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/95"
                )}
              >
                {grantSubmitting ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    正在授权...
                  </>
                ) : (
                  "签发授权并重新运行"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Workflow,
  GitBranch,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowNode, WorkflowEdge } from "@/lib/server/workflow/dag-types";

// ---- 类型定义 ----

/** API 返回的生成结果 */
interface GenerateResult {
  workflowId: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata: {
    industry: string;
    generatedBy: string;
    version: string;
  };
}

// ---- 自动化等级样式映射 ----

const AUTOMATION_STYLE: Record<string, { label: string; className: string }> = {
  L1: { label: "全自动", className: "bg-success/10 text-success border-success/30" },
  L2: { label: "建议执行", className: "bg-brand-blue/10 text-brand-blue border-brand-blue/30" },
  L3: { label: "需人工确认", className: "bg-warning/10 text-warning border-warning/30" },
  L4: { label: "禁止自动", className: "bg-danger/10 text-danger border-danger/30" },
};

// ---- 节点图标映射 ----

const NODE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  condition: GitBranch,
  subworkflow: Workflow,
  noop: () => null,
};

// ---- API 调用 ----

async function generateWorkflowApi(
  intent: string,
  industryContext: string,
): Promise<GenerateResult> {
  const res = await fetch("/api/workflows/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent, industryContext }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `请求失败 (${res.status})`);
  }

  const body = await res.json();
  if (!body.success || !body.data) {
    throw new Error(body.error ?? "生成失败");
  }
  return body.data;
}

// ---- 子组件：单节点预览卡片 ----

function NodePreviewCard({ node, index }: { node: WorkflowNode; index: number }) {
  const level = (node.config?.automationLevel as string) ?? "L2";
  const style = AUTOMATION_STYLE[level] ?? AUTOMATION_STYLE.L2;
  const Icon = NODE_ICON[node.kind];

  return (
    <div
      className={cn(
        "bg-card rounded-xl border border-border p-3.5",
        "hover:border-primary/30 transition-colors duration-150",
      )}
    >
      {/* 节点头部 */}
      <div className="flex items-center gap-2.5 mb-2">
        {/* 序号 */}
        <span
          className={cn(
            "size-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0",
            "bg-primary/10 text-primary",
          )}
        >
          {index + 1}
        </span>
        {/* 名称 */}
        <span className="text-foreground text-sm font-medium truncate flex-1">
          {node.name}
        </span>
        {/* 自动化等级 Badge */}
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-md font-medium border shrink-0",
            style.className,
          )}
        >
          {style.label}
        </span>
      </div>

      {/* 节点详情 */}
      <div className="flex items-center gap-3 text-xs">
        {/* kind */}
        <span className="text-hint">
          {node.kind === "task"
            ? "任务"
            : node.kind === "condition"
              ? "条件分支"
              : node.kind === "subworkflow"
                ? "子流程"
                : "占位"}
        </span>
        {/* ID */}
        <span className="text-hint font-mono">{node.id}</span>
        {/* 图标 */}
        {Icon && <Icon className="size-3 text-muted-foreground ml-auto" />}
      </div>

      {/* 节点描述 */}
      {node.config?.description != null && (
        <p className="mt-2 text-muted-foreground text-xs leading-relaxed line-clamp-2">
          {node.config.description as string}
        </p>
      )}
    </div>
  );
}

// ---- 子组件：边连接线 ----

function EdgeConnector() {
  return (
    <div className="flex items-center justify-center py-0.5">
      <ArrowRight className="size-3.5 text-hint rotate-90" />
    </div>
  );
}

// ---- 子组件：元数据卡片 ----

function MetadataCard({ metadata }: { metadata: GenerateResult["metadata"] }) {
  return (
    <div className="flex flex-wrap gap-2 mt-4">
      <span className="text-[10px] text-hint bg-background border border-border rounded-md px-2 py-1 font-medium uppercase tracking-wider">
        {metadata.industry === "foreign-trade" ? "外贸行业" : metadata.industry}
      </span>
      <span className="text-[10px] text-hint bg-background border border-border rounded-md px-2 py-1 font-medium">
        v{metadata.version}
      </span>
      <span className="text-[10px] text-hint bg-background border border-border rounded-md px-2 py-1 font-medium">
        需人工审核后激活
      </span>
    </div>
  );
}

// ---- 主组件 ----

export function WorkflowGeneratorPanel() {
  const [intent, setIntent] = useState("");

  const mutation = useMutation({
    mutationFn: (input: { intent: string; industryContext: string }) =>
      generateWorkflowApi(input.intent, input.industryContext),
  });

  const handleGenerate = () => {
    if (!intent.trim() || mutation.isPending) return;
    mutation.mutate({ intent: intent.trim(), industryContext: "foreign-trade" });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const result = mutation.data;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
      {/* ---- 标题 ---- */}
      <div className="flex items-center gap-2.5">
        <div className="bg-primary/10 rounded-lg p-1.5">
          <Sparkles className="size-4 text-primary" />
        </div>
        <div>
          <h3 className="text-foreground text-sm font-semibold">
            AI 工作流生成
          </h3>
          <p className="text-hint text-xs mt-0.5">
            输入业务意图，自动生成 DAG 工作流（需人工审核后激活）
          </p>
        </div>
      </div>

      {/* ---- 输入区 ---- */}
      <div className="space-y-3">
        <textarea
          rows={3}
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述您需要的工作流，例如：当收到新询盘时，先对客户背景做分析，再根据分析结果自动评分，高分客户生成开发信草稿……"
          className={cn(
            "w-full bg-background border border-border rounded-xl px-3.5 py-2.5",
            "text-foreground text-sm placeholder:text-hint",
            "focus:outline-none focus:border-primary/60 transition-colors",
            "resize-none",
          )}
        />

        <button
          type="button"
          onClick={handleGenerate}
          disabled={!intent.trim() || mutation.isPending}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl",
            "bg-primary text-white text-sm font-medium",
            "hover:bg-primary/90 active:scale-[0.99] transition-all",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              正在生成 DAG 工作流...
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              生成工作流
            </>
          )}
        </button>
      </div>

      {/* ---- 错误提示 ---- */}
      {mutation.isError && (
        <div className="flex items-start gap-2 bg-danger/10 rounded-xl p-3">
          <AlertCircle className="size-4 text-danger mt-0.5 shrink-0" />
          <p className="text-danger text-xs leading-relaxed">
            {mutation.error instanceof Error
              ? mutation.error.message
              : "生成失败，请重试"}
          </p>
        </div>
      )}

      {/* ---- 生成结果预览 ---- */}
      {result && (
        <div className="border-t border-border pt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
          {/* 成功标题 */}
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success shrink-0" />
            <span className="text-foreground text-sm font-medium">
              工作流已生成
            </span>
            <span className="text-hint text-xs font-mono">
              {result.workflowId.slice(0, 8)}…
            </span>
          </div>

          {/* 工作流名称 */}
          <p className="text-foreground text-sm font-semibold leading-snug">
            {result.name}
          </p>

          {/* 节点列表预览 */}
          {result.nodes.length > 0 && (
            <div>
              <p className="text-muted-foreground text-xs font-medium mb-2 flex items-center gap-1.5">
                <Shield className="size-3" />
                DAG 节点预览（{result.nodes.length} 个节点 ·{" "}
                {result.edges.length} 条边）
              </p>
              <div className="space-y-1">
                {result.nodes.map((node, i) => (
                  <div key={node.id}>
                    <NodePreviewCard node={node} index={i} />
                    {i < result.nodes.length - 1 && <EdgeConnector />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 元数据标签 */}
          <MetadataCard metadata={result.metadata} />

          {/* 提示：需人工审核 */}
          <div className="flex items-start gap-2 bg-warning/10 rounded-xl p-3">
            <AlertCircle className="size-3.5 text-warning mt-0.5 shrink-0" />
            <p className="text-warning text-xs leading-relaxed">
              此工作流状态为「草稿」，需在管理后台完成 Review
              并确认节点配置和自动化授权等级后，手动激活方可执行。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

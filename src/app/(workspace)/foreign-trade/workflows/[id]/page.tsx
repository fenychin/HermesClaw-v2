"use client";

import { useEffect, useMemo, useCallback, use } from "react";
import { GitBranch } from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/empty-state";
import { WorkflowStepNav } from "../../_components/workflow-step-nav";
import { WorkflowExecutor } from "../../_components/workflow-executor";
import { WorkflowContextPanel } from "../../_components/workflow-context-panel";
import { getWorkflowById } from "../../_data/workflow-details";
import { useWorkflowExecutionStore } from "@/stores/workflow-execution-store";
import type { Workflow, WorkflowRunStatus } from "@/types/workflow";

// ============================================================
// 页面主体（Client Component）
// ============================================================

interface WorkflowDetailClientProps {
  /** 从路由 params.id 解析出的初始工作流数据 */
  initialWorkflow: Workflow;
}

/**
 * 工作流详情页客户端交互层
 * —— 从 Zustand Store 读取动态状态，并与静态定义合并
 */
function WorkflowDetailClient({ initialWorkflow }: WorkflowDetailClientProps) {
  const { workflowId, stepStates, startWorkflow, resetWorkflow } = useWorkflowExecutionStore();

  // 初始化时，如果 store 中的 workflowId 不一致，则重置 store
  useEffect(() => {
    if (workflowId !== initialWorkflow.id) {
      resetWorkflow();
    }
  }, [workflowId, initialWorkflow.id, resetWorkflow]);

  // 将静态的工作流定义与 Store 中的动态执行状态合并
  const mergedWorkflow = useMemo<Workflow>(() => {
    if (!stepStates || stepStates.length === 0) {
      return initialWorkflow;
    }
    
    // 推导整体运行状态
    let runStatus: WorkflowRunStatus = "idle";
    const allCompleted = stepStates.every((s) => s.status === "completed");
    const anyRunning = stepStates.some((s) => s.status === "running");
    if (allCompleted) runStatus = "completed";
    else if (anyRunning) runStatus = "running";

    return {
      ...initialWorkflow,
      runStatus,
      steps: initialWorkflow.steps.map((step, idx) => {
        const state = stepStates[idx];
        if (!state) return step;
        return {
          ...step,
          status: state.status,
          durationSec: state.durationSec,
          // 如果需要将动态 output 放回 workflow definition，可以在这里合并
          outputs: step.outputs?.map(out => ({
             ...out,
             value: state.outputs[out.key] || out.value // 用 store 中的值覆盖
          }))
        };
      }),
    };
  }, [initialWorkflow, stepStates]);

  const handleRun = useCallback(() => {
    startWorkflow(initialWorkflow.id, initialWorkflow.steps.length);
  }, [initialWorkflow.id, initialWorkflow.steps.length, startWorkflow]);

  const handleRestart = useCallback(() => {
    resetWorkflow();
  }, [resetWorkflow]);

  return (
    <PageTransition>
      {/* 三栏容器：全高、overflow 隐藏防双滚动条 */}
      <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
        {/* ============ 左栏：步骤导航 w-56 ============ */}
        <WorkflowStepNav workflow={mergedWorkflow} onRestart={handleRestart} />

        {/* ============ 中栏：工作流执行区 flex-1 ============ */}
        <main className="flex-1 min-w-0 h-full overflow-hidden">
          <WorkflowExecutor
            workflow={mergedWorkflow}
            runStatus={mergedWorkflow.runStatus || "idle"}
            onRun={handleRun}
          />
        </main>

        {/* ============ 右栏：上下文配置面板 w-64 ============ */}
        <WorkflowContextPanel />
      </div>
    </PageTransition>
  );
}

// ============================================================
// Next.js Page 入口（Server Component）
// ============================================================

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * 工作流详情页
 * —— 通过 params.id 从 mock 数据中匹配对应 Workflow；
 *    无匹配数据时显示 EmptyState
 */
export default function WorkflowDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const workflow = getWorkflowById(id);

  // 未匹配到对应工作流时，渲染空状态
  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={GitBranch}
          title="工作流不存在"
          description={`未找到 ID 为「${id}」的工作流，请返回外贸工作台重新选择。`}
        />
      </div>
    );
  }

  return <WorkflowDetailClient initialWorkflow={workflow} />;
}

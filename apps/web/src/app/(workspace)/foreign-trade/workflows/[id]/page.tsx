"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * 工作流详情页 — 重定向入口
 *
 * 由于工作流执行已全部迁移至 /workspace/chat（对话即结果原则），
 * 此路由不再承担执行功能，仅作为重定向跳板：
 * - 有 runId 参数 → 跳转 /workspace/chat?workflowRunId={runId}
 * - 无 runId 参数 → 跳转 /workspace/foreign-trade（返回工作台）
 *
 * WorkflowExecutor 组件文件保留，供将来审计面板复用。
 */
export default function WorkflowDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <span className="text-sm">正在进入对话执行模式...</span>
          </div>
        </div>
      }
    >
      <WorkflowRedirect />
    </Suspense>
  );
}

function WorkflowRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const runId = searchParams.get("runId");

    if (runId) {
      router.replace(`/workspace/chat?workflowRunId=${encodeURIComponent(runId)}`);
    } else {
      router.replace("/workspace/foreign-trade");
    }
  }, [searchParams, router]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <span className="text-sm">正在进入对话执行模式...</span>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useAgentStore } from "@/stores/agent-store";
import { AgentListPanel } from "./agent-list-panel";
import { AgentDetailPanel } from "./agent-detail-panel";
import { SkeletonCard } from "@/components/common/skeleton-card";
import { AlertCircle, RefreshCw } from "lucide-react";

/** 创建智能体弹窗：按需加载（~132KB，含 icons + harness spec UI），首屏不加载 */
const AgentCreateModal = dynamic(
  () => import("./agent-create-modal").then((m) => ({ default: m.AgentCreateModal })),
  { ssr: false },
);

interface AgentsPageClientProps {
  /** 页面加载时自动选中的智能体 ID（来自 URL 参数） */
  initialAgentId?: string;
}

/**
 * 智能体页面客户端布局
 * —— 左右双栏：左侧 AgentListPanel（w-80 固定）+ 右侧 AgentDetailPanel（flex-1）
 *    数据从 /api/agents 加载
 */
export function AgentsPageClient({ initialAgentId }: AgentsPageClientProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const agents = useAgentStore((s) => s.agents);
  const loading = useAgentStore((s) => s.loading);
  const error = useAgentStore((s) => s.error);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const setSelectedAgent = useAgentStore((s) => s.setSelectedAgent);

  // 挂载时加载智能体列表
  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // URL 参数 → 自动选中智能体（等数据加载完成后）
  useEffect(() => {
    if (initialAgentId && agents.length > 0) {
      setSelectedAgent(initialAgentId);
    }
  }, [initialAgentId, agents.length, setSelectedAgent]);

  // ---- 加载中骨架屏 ----
  if (loading && agents.length === 0) {
    return (
      <div className="flex h-full">
        <div className="border-border w-80 shrink-0 space-y-3 overflow-y-auto border-r p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} variant="list-item" />
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center space-y-3">
            <div className="bg-accent mx-auto size-10 animate-pulse rounded-xl" />
            <p className="text-muted-foreground text-sm">正在加载智能体…</p>
          </div>
        </div>
      </div>
    );
  }

  // ---- 错误状态 ----
  if (error && agents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-4">
          <div className="bg-danger/10 mx-auto flex size-14 items-center justify-center rounded-2xl">
            <AlertCircle className="text-danger size-7" />
          </div>
          <div>
            <p className="text-foreground text-lg font-semibold">加载失败</p>
            <p className="text-muted-foreground mt-1 text-sm">{error}</p>
          </div>
          <button
            type="button"
            onClick={loadAgents}
            className="bg-brand hover:bg-brand/90 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-colors"
          >
            <RefreshCw className="size-4" />
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* ======== 左侧：智能体列表（w-80 固定，overflow-y-auto） ======== */}
      <div className="border-border w-80 shrink-0 overflow-y-auto border-r">
        <AgentListPanel onCreateClick={() => setCreateModalOpen(true)} />
      </div>

      {/* ======== 右侧：智能体详情或空状态（flex-1，overflow-y-auto） ======== */}
      <div className="flex-1 overflow-y-auto">
        <AgentDetailPanel />
      </div>

      {/* ======== 创建智能体弹窗 ======== */}
      <AgentCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
      />
    </div>
  );
}

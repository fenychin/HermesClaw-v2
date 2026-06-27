"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Layers,
  Search,
  AlertCircle,
  RefreshCw,
  Brain,
  Puzzle,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageTransition } from "@/components/common/PageTransition";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SkeletonCard } from "@/components/common/skeleton-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Memory, MemoryType, MemoryStats, KnowledgeGap, MemoryRevision } from "@/types";

import { MemoryCard } from "./_components/memory-card";
import { MemoryRevisionDialog } from "./_components/memory-revision-dialog";
import { KnowledgeGapPanel } from "./_components/knowledge-gap-panel";
import { MemoryStatsBar } from "./_components/memory-stats-bar";
import { FreezeConfirmDialog } from "./_components/freeze-confirm-dialog";

// ============================================================
// 常量
// ============================================================

const TIER_LABEL: Record<MemoryType, string> = {
  short: "短期记忆",
  mid: "中期记忆",
  long: "长期记忆",
};

const TIER_DESC: Record<MemoryType, string> = {
  short: "实时会话上下文与临时任务状态",
  mid: "项目级与客户级沉淀、阶段性策略",
  long: "企业 SOP、产品知识与组织级经验库",
};

// ============================================================
// 主组件
// ============================================================

export default function KnowledgePageClient() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<MemoryType>("mid");
  const [searchQuery, setSearchQuery] = useState("");
  const [showGapPanel, setShowGapPanel] = useState(false);

  // 版本历史 Dialog 状态
  const [revisionMemory, setRevisionMemory] = useState<Memory | null>(null);

  // 冻结确认 Dialog 状态
  const [freezeTarget, setFreezeTarget] = useState<{
    id: string;
    frozen: boolean;
    summary: string;
  } | null>(null);

  // ----- 查询：记忆列表 -----
  const {
    data: memoriesData,
    isLoading: loadingMemories,
    error: memoryError,
    refetch: refetchMemories,
  } = useQuery({
    queryKey: ["workspace-memories", activeTab],
    queryFn: async () => {
      const res = await fetch(`/api/brain/memory?type=${activeTab}&pageSize=50`);
      if (!res.ok) throw new Error("加载记忆列表失败");
      const json = await res.json();
      return (json?.data?.memories || []) as Memory[];
    },
  });

  const memories = memoriesData || [];

  // ----- 查询：命中统计 -----
  const {
    data: statsData,
    isLoading: loadingStats,
  } = useQuery<MemoryStats & { memoryCounts: Record<string, number>; frozenCount: number }>({
    queryKey: ["memory-stats"],
    queryFn: async () => {
      const res = await fetch("/api/memory/stats");
      if (!res.ok) throw new Error("加载统计失败");
      const json = await res.json();
      return json?.data;
    },
    refetchInterval: 30_000, // 30s 静默刷新
  });

  // ----- 查询：知识缺口 -----
  const {
    data: gapsData,
    isLoading: loadingGaps,
  } = useQuery({
    queryKey: ["knowledge-gaps"],
    queryFn: async () => {
      const res = await fetch("/api/memory/gaps?status=open");
      if (!res.ok) throw new Error("加载知识缺口失败");
      const json = await res.json();
      return (json?.data?.gaps || []) as KnowledgeGap[];
    },
  });

  const gaps = gapsData || [];

  // ----- 查询：版本历史（按需加载） -----
  const {
    data: revisionsData,
    isLoading: loadingRevisions,
  } = useQuery({
    queryKey: ["memory-revisions", revisionMemory?.id],
    queryFn: async () => {
      if (!revisionMemory) return [];
      const res = await fetch(`/api/memory/${revisionMemory.id}/revisions`);
      if (!res.ok) throw new Error("加载版本历史失败");
      const json = await res.json();
      return (json?.data?.revisions || json?.revisions || []) as MemoryRevision[];
    },
    enabled: !!revisionMemory,
  });

  // ----- Mutation：冻结/解冻 -----
  const freezeMutation = useMutation({
    mutationFn: async ({ id, frozen, reason }: { id: string; frozen: boolean; reason?: string }) => {
      const res = await fetch(`/api/memory/${id}/freeze`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frozen, reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: "操作失败" } }));
        throw new Error(err?.error?.message || err?.error || "权限不足或操作失败");
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast.success(variables.frozen ? "记忆已冻结" : "记忆已解冻");
      queryClient.invalidateQueries({ queryKey: ["workspace-memories"] });
      queryClient.invalidateQueries({ queryKey: ["memory-stats"] });
      setFreezeTarget(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "操作失败");
    },
  });

  // ----- Mutation：删除 -----
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/brain/memory?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      return res.json();
    },
    onSuccess: () => {
      toast.success("记忆已删除");
      queryClient.invalidateQueries({ queryKey: ["workspace-memories"] });
    },
    onError: () => toast.error("删除失败"),
  });

  // ----- 过滤 -----
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter(
      (m) =>
        m.summary?.toLowerCase().includes(q) ||
        m.content?.toLowerCase().includes(q) ||
        m.tags?.some((t: string) => t.toLowerCase().includes(q))
    );
  }, [memories, searchQuery]);

  // ----- 事件处理 -----
  const handleViewRevisions = (memory: Memory) => {
    setRevisionMemory(memory);
  };

  const handleFreeze = (id: string, frozen: boolean, summary: string) => {
    setFreezeTarget({ id, frozen, summary });
  };

  const handleConfirmFreeze = () => {
    if (!freezeTarget) return;
    freezeMutation.mutate({
      id: freezeTarget.id,
      frozen: freezeTarget.frozen,
      reason: freezeTarget.frozen
        ? "管理员在控制台手动冻结"
        : "管理员在控制台手动解冻",
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("确认删除该条记忆吗？此操作不可恢复。")) {
      deleteMutation.mutate(id);
    }
  };

  // ----- 加载态 -----
  if (loadingMemories && memories.length === 0) {
    return (
      <PageTransition>
        <div className="w-full max-w-7xl mx-auto py-6 px-6 space-y-6">
          <PageHeader
            title="记忆体"
            description="短/中/长期三级记忆体系：知识版本化 · 来源溯源 · 命中统计 · 缺口管理"
            breadcrumb={[{ label: "智慧大脑", href: "/workspace/knowledge" }, { label: "记忆体" }]}
          />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} variant="stat" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} variant="card" />
            ))}
          </div>
        </div>
      </PageTransition>
    );
  }

  // ----- 错误态 -----
  if (memoryError && memories.length === 0) {
    return (
      <PageTransition>
        <div className="w-full max-w-7xl mx-auto py-6 px-6 space-y-6">
          <PageHeader
            title="记忆体"
            description="短/中/长期三级记忆体系：知识版本化 · 来源溯源 · 命中统计 · 缺口管理"
            breadcrumb={[{ label: "智慧大脑", href: "/workspace/knowledge" }, { label: "记忆体" }]}
          />
          <div className="flex flex-col items-center justify-center py-20">
            <div className="bg-danger/10 mb-4 flex size-14 items-center justify-center rounded-2xl">
              <AlertCircle className="text-danger size-7" />
            </div>
            <p className="text-foreground text-lg font-semibold">加载失败</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {String(memoryError)}
            </p>
            <Button
              variant="default"
              onClick={() => refetchMemories()}
              className="mt-4"
            >
              <RefreshCw className="size-4 mr-1" />
              重新加载
            </Button>
          </div>
        </div>
      </PageTransition>
    );
  }

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <PageTransition>
      <div className="w-full max-w-7xl mx-auto py-6 px-6 space-y-6">
        {/* 页头 */}
        <PageHeader
          title="记忆体"
          description="短/中/长期三级记忆体系：知识版本化 · 来源溯源 · 命中统计 · 缺口管理"
          breadcrumb={[{ label: "智慧大脑", href: "/workspace/knowledge" }, { label: "记忆体" }]}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant={showGapPanel ? "default" : "outline"}
                size="sm"
                onClick={() => setShowGapPanel(!showGapPanel)}
              >
                <Puzzle className="size-3.5 mr-1" />
                知识缺口
                {gaps.length > 0 && (
                  <Badge variant="destructive" className="ml-1.5 px-1 py-0 text-[10px]">
                    {gaps.length}
                  </Badge>
                )}
              </Button>
            </div>
          }
        />

        {/* 统计条 */}
        <MemoryStatsBar
          stats={statsData ?? null}
          loading={loadingStats}
        />

        {/* 知识缺口面板（可折叠） */}
        {showGapPanel && (
          <KnowledgeGapPanel gaps={gaps} loading={loadingGaps} />
        )}

        {/* 搜索工具栏 */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card/60 border border-border/80 p-4 rounded-2xl backdrop-blur-md">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={`搜索${TIER_LABEL[activeTab]}、标签或内容...`}
              className="pl-9 bg-background/50 border-border focus:border-brand/50 text-xs h-9 rounded-xl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 items-center text-xs text-muted-foreground bg-accent/30 px-3 py-1.5 rounded-lg border border-border/30">
            <Layers className="size-3.5 text-brand" />
            <span>当前区间共 {memories.length} 条记忆</span>
            {statsData && (
              <span className="text-hint ml-1">
                (冻结: {statsData.frozenCount})
              </span>
            )}
          </div>
        </div>

        {/* 记忆分级 Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as MemoryType)}
        >
          <TabsList>
            <TabsTrigger value="short">
              短期记忆
              <span className="bg-accent text-muted-foreground ml-1.5 rounded-full px-2 py-0.5 text-[10px]">
                {statsData?.memoryCounts?.short ?? "..."}
              </span>
            </TabsTrigger>
            <TabsTrigger value="mid">
              中期记忆
              <span className="bg-accent text-muted-foreground ml-1.5 rounded-full px-2 py-0.5 text-[10px]">
                {statsData?.memoryCounts?.mid ?? "..."}
              </span>
            </TabsTrigger>
            <TabsTrigger value="long">
              长期记忆
              <span className="bg-accent text-muted-foreground ml-1.5 rounded-full px-2 py-0.5 text-[10px]">
                {statsData?.memoryCounts?.long ?? "..."}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {memories.length === 0 ? (
              <EmptyState
                icon={Brain}
                title={`暂无${TIER_LABEL[activeTab]}`}
                description={TIER_DESC[activeTab]}
                action={{
                  label: "触发记忆生成",
                  onClick: () => toast.info("记忆生成任务已加入调度队列"),
                }}
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Search}
                title="未找到匹配的记忆"
                description="请尝试调整搜索关键词"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map((memory) => (
                  <MemoryCard
                    key={memory.id}
                    memory={memory}
                    onViewRevisions={handleViewRevisions}
                    onDelete={handleDelete}
                    onFreeze={handleFreeze}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* 版本历史 Dialog */}
        {revisionMemory && (
          <MemoryRevisionDialog
            memory={revisionMemory}
            revisions={
              // 优先使用按需加载的版本历史，降级为 memory 内嵌的 revisions
              revisionsData && revisionsData.length > 0
                ? revisionsData
                : (revisionMemory.revisions || [])
            }
            loading={loadingRevisions}
            open={!!revisionMemory}
            onClose={() => setRevisionMemory(null)}
          />
        )}

        {/* 冻结确认 Dialog */}
        {freezeTarget && (
          <FreezeConfirmDialog
            open={!!freezeTarget}
            frozen={freezeTarget.frozen}
            summary={freezeTarget.summary}
            loading={freezeMutation.isPending}
            onConfirm={handleConfirmFreeze}
            onCancel={() => setFreezeTarget(null)}
          />
        )}
      </div>
    </PageTransition>
  );
}

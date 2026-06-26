"use client";

import { useMemo, useEffect, useState } from "react";
import {
  Layers,
  Lock,
  Archive,
  Trash2,
  Snowflake,
  ArrowUp,
  AlertCircle,
  RefreshCw,
  Loader2,
  Search,
  Edit2,
  Calendar,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageTransition } from "@/components/common/PageTransition";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SkeletonCard } from "@/components/common/skeleton-card";
import type { Memory, MemoryType } from "@/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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

function confidenceColor(confidence: number): string {
  if (confidence >= 0.9) return "text-success";
  if (confidence >= 0.7) return "text-warning";
  return "text-danger";
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");
  return `${month}月${day}日 ${hour}:${minute}`;
}

interface MemoryCardProps {
  memory: Memory;
  onEdit: (m: Memory) => void;
  onViewRevisions: (m: Memory) => void;
  onDelete: (id: string) => void;
  onUpgrade: (id: string, type: "mid" | "long") => void;
  onFreeze: (id: string, frozen: boolean) => void;
}

function MemoryCard({ memory, onEdit, onViewRevisions, onDelete, onUpgrade, onFreeze }: MemoryCardProps) {
  const displayTime = useMemo(() => {
    if (memory.updatedAt && memory.updatedAt !== memory.createdAt) {
      return `更新于: ${formatTime(memory.updatedAt)}`;
    }
    return formatTime(memory.createdAt);
  }, [memory]);

  const friendlySource = useMemo(() => {
    if (memory.relatedAgent) return `智能体: ${memory.relatedAgent}`;
    if (memory.relatedProject) return `项目: ${memory.relatedProject}`;
    if (memory.source === "manual" || memory.source === "user") return "人工录入 SOP";
    if (memory.source === "system") return "自演化引擎";
    return memory.source === "auto" ? "工作流捕获" : memory.source;
  }, [memory]);

  return (
    <div className="bg-card border-border rounded-xl border p-4 flex flex-col justify-between min-h-[160px] text-left">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-muted-foreground shrink-0 text-xs">
            {displayTime}
          </span>
          <span className="bg-accent text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium max-w-[120px] truncate">
            {friendlySource}
          </span>
          {memory.version && memory.version > 1 ? (
            <span className="bg-brand/10 text-brand rounded-full px-2 py-0.5 text-[10px] font-mono font-medium">
              v{memory.version}
            </span>
          ) : null}
          <div className="flex-1" />
          <span
            className={cn(
              "shrink-0 text-xs font-medium",
              confidenceColor(memory.confidence),
            )}
          >
            {Math.round(memory.confidence * 100)}%
          </span>
          {memory.frozen && <Lock className="text-brand size-3.5 shrink-0" />}
        </div>

        <p className="text-foreground mb-3 line-clamp-3 text-sm leading-relaxed font-medium">
          {memory.summary}
        </p>

        {memory.content && memory.type !== "short" && (
          <p className="text-muted-foreground mb-3 line-clamp-2 text-xs leading-relaxed">
            {memory.content}
          </p>
        )}

        {memory.tags && memory.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {memory.tags.map((tag) => (
              <span
                key={tag}
                className="bg-accent text-hint rounded-md px-2 py-0.5 text-[10px]"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="border-border flex items-center gap-1 border-t pt-2.5 mt-2 flex-wrap">
        {/* 短期记忆可以一键提升为中期或长期 */}
        {memory.type === "short" && (
          <>
            <button
              type="button"
              onClick={() => onUpgrade(memory.id, "mid")}
              className="text-brand hover:bg-brand/10 inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors"
            >
              <ArrowUp className="size-3" />
              升至中期
            </button>
            <button
              type="button"
              onClick={() => onUpgrade(memory.id, "long")}
              className="text-brand hover:bg-brand/10 inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors"
            >
              <ArrowUp className="size-3" />
              升至长期
            </button>
          </>
        )}
        
        {/* 中期记忆可以一键提升为长期 */}
        {memory.type === "mid" && (
          <>
            <button
              type="button"
              onClick={() => onUpgrade(memory.id, "long")}
              className="text-brand hover:bg-brand/10 inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors"
            >
              <ArrowUp className="size-3" />
              升至长期
            </button>
            <button
              type="button"
              onClick={() => onEdit(memory)}
              className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors"
            >
              <Edit2 className="size-3" />
              编辑
            </button>
          </>
        )}

        {/* 长期记忆可以查看历史版本 */}
        {memory.type === "long" && (
          <button
            type="button"
            onClick={() => onViewRevisions(memory)}
            className="text-brand hover:bg-brand/10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors"
          >
            <Calendar className="size-3" />
            修订历史
          </button>
        )}

        <button
          type="button"
          onClick={() => onFreeze(memory.id, !memory.frozen)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
            memory.frozen
              ? "text-brand hover:bg-brand/10"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          {memory.frozen ? (
            <>
              <Lock className="size-3" />
              解冻
            </>
          ) : (
            <>
              <Snowflake className="size-3" />
              冻结
            </>
          )}
        </button>
        
        <div className="flex-1" />
        
        <button
          type="button"
          onClick={() => onDelete(memory.id)}
          className="text-danger hover:bg-danger/10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors font-medium"
        >
          <Trash2 className="size-3" />
          删除
        </button>
      </div>
    </div>
  );
}

interface MemoryViewProps {
  initialTab?: MemoryType;
}

export function MemoryView({ initialTab }: MemoryViewProps) {
  const [activeTab, setActiveTab] = useState<MemoryType>(initialTab || "short");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [viewingMemory, setViewingMemory] = useState<Memory | null>(null);

  // 编辑表单 State
  const [editSummary, setEditSummary] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState("");

  const queryClient = useQueryClient();

  const { data: memoriesData, isLoading: loading, error, refetch: loadMemories } = useQuery({
    queryKey: ["brain-memories", activeTab],
    queryFn: async () => {
      const res = await fetch(`/api/brain/memory?type=${activeTab}`);
      if (!res.ok) throw new Error("加载记忆列表失败");
      return res.json();
    }
  });

  const memories = memoriesData?.data?.memories || [];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/brain/memory?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brain-memories"] });
    }
  });

  const upgradeMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: "mid" | "long" }) => {
      const res = await fetch(`/api/brain/memory?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
      if (!res.ok) throw new Error("升格失败");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brain-memories"] });
    }
  });

  const freezeMutation = useMutation({
    mutationFn: async ({ id, frozen }: { id: string; frozen: boolean }) => {
      const res = await fetch(`/api/brain/memory?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frozen })
      });
      if (!res.ok) throw new Error("操作失败");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brain-memories"] });
    }
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, summary, content, tags }: { id: string; summary: string; content: string; tags: string[] }) => {
      const res = await fetch(`/api/brain/memory?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, content, tags, reason: "用户在控制台手动编辑" })
      });
      if (!res.ok) throw new Error("保存失败");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brain-memories"] });
      setEditingMemory(null);
    }
  });

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return memories;
    return memories.filter(
      (m: any) =>
        m.summary.toLowerCase().includes(query) ||
        (m.content && m.content.toLowerCase().includes(query)) ||
        (m.tags && m.tags.some((t: string) => t.toLowerCase().includes(query)))
    );
  }, [memories, searchQuery]);

  const handleEdit = (memory: Memory) => {
    setEditingMemory(memory);
    setEditSummary(memory.summary);
    setEditContent(memory.content || "");
    setEditTags(memory.tags ? memory.tags.join(", ") : "");
  };

  const handleSaveEdit = () => {
    if (!editingMemory) return;
    const tagsArr = editTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    editMutation.mutate({
      id: editingMemory.id,
      summary: editSummary,
      content: editContent,
      tags: tagsArr
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("确认删除该条记忆吗？此操作不可恢复。")) {
      deleteMutation.mutate(id);
    }
  };

  const handleUpgrade = (id: string, type: "mid" | "long") => {
    upgradeMutation.mutate({ id, type });
  };

  const handleFreeze = (id: string, frozen: boolean) => {
    freezeMutation.mutate({ id, frozen });
  };

  const handleBatchClear = async () => {
    if (!confirm(`确认清理全部短期记忆？此操作不可撤销。`)) return;
    const shortMemories = memories.filter((m: any) => m.type === "short");
    try {
      await Promise.all(shortMemories.map((m: any) => fetch(`/api/brain/memory?id=${m.id}`, { method: "DELETE" })));
      queryClient.invalidateQueries({ queryKey: ["brain-memories", "short"] });
    } catch {
      alert("批量清理中存在部分错误");
    }
  };

  if (loading && memories.length === 0) {
    return (
      <PageTransition>
        <div className="w-full max-w-7xl mx-auto py-6 px-6 space-y-6">
          <PageHeader
            title="记忆体"
            description="短/中/长期三级记忆体系：实时会话 → 项目沉淀 → 企业知识"
            breadcrumb={[{ label: "智慧大脑", href: "/brain/memory" }, { label: "记忆体" }]}
          />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} variant="card" />
            ))}
          </div>
        </div>
      </PageTransition>
    );
  }

  if (error && memories.length === 0) {
    return (
      <PageTransition>
        <div className="w-full max-w-7xl mx-auto py-6 px-6 space-y-6">
          <PageHeader
            title="记忆体"
            description="短/中/长期三级记忆体系：实时会话 → 项目沉淀 → 企业知识"
            breadcrumb={[{ label: "智慧大脑", href: "/brain/memory" }, { label: "记忆体" }]}
          />
          <div className="flex flex-col items-center justify-center py-20">
            <div className="bg-danger/10 mb-4 flex size-14 items-center justify-center rounded-2xl">
              <AlertCircle className="text-danger size-7" />
            </div>
            <p className="text-foreground text-lg font-semibold">加载失败</p>
            <p className="text-muted-foreground mt-1 text-sm">{String(error)}</p>
            <button
              type="button"
              onClick={() => loadMemories()}
              className="bg-brand hover:bg-brand/90 mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-colors"
            >
              <RefreshCw className="size-4" />
              重新加载
            </button>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="w-full max-w-7xl mx-auto py-6 px-6 space-y-6">
        <PageHeader
          title="记忆体"
          description="短/中/长期三级记忆体系：实时会话 → 项目沉淀 → 企业知识"
          breadcrumb={[{ label: "智慧大脑", href: "/brain/memory" }, { label: "记忆体" }]}
        />

        {/* 统一搜索过滤工具栏 */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card/60 border border-border/80 p-4 rounded-2xl backdrop-blur-md">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={`搜索${TIER_LABEL[activeTab]}、标签或内容...`}
              className="pl-9 bg-background/50 border-border focus:border-[#6D5EF9]/50 text-xs h-9 rounded-xl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 items-center text-xs text-muted-foreground bg-accent/30 px-3 py-1.5 rounded-lg border border-border/30">
            <Layers className="size-3.5 text-[#6D5EF9]" />
            <span>当前区间共 {memories.length} 条记忆</span>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as MemoryType)}
        >
          <TabsList>
            <TabsTrigger value="short">
              短期记忆
              <span className="bg-accent text-muted-foreground ml-1.5 rounded-full px-2 py-0.5 text-[10px]">
                {activeTab === "short" ? memories.length : "..."}
              </span>
            </TabsTrigger>
            <TabsTrigger value="mid">
              中期记忆
              <span className="bg-accent text-muted-foreground ml-1.5 rounded-full px-2 py-0.5 text-[10px]">
                {activeTab === "mid" ? memories.length : "..."}
              </span>
            </TabsTrigger>
            <TabsTrigger value="long">
              长期记忆
              <span className="bg-accent text-muted-foreground ml-1.5 rounded-full px-2 py-0.5 text-[10px]">
                {activeTab === "long" ? memories.length : "..."}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {memories.length === 0 ? (
              <EmptyState
                icon={Layers}
                title={`暂无${TIER_LABEL[activeTab]}`}
                description="随对话积累，系统将自动汇总和沉淀对应记忆"
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Search}
                title="未找到匹配的记忆"
                description="请尝试调整搜索关键词"
              />
            ) : (
              <div className="space-y-3">
                {activeTab === "short" && (
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={handleBatchClear}
                      className="text-danger hover:bg-danger/10 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                      清理全部短期记忆
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {filtered.map((memory: Memory) => (
                    <MemoryCard
                      key={memory.id}
                      memory={memory}
                      onEdit={handleEdit}
                      onViewRevisions={setViewingMemory}
                      onDelete={handleDelete}
                      onUpgrade={handleUpgrade}
                      onFreeze={handleFreeze}
                    />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* 中期记忆编辑 Dialog */}
        {editingMemory && (
          <Dialog open={!!editingMemory} onOpenChange={(open) => !open && setEditingMemory(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>编辑中期记忆</DialogTitle>
                <DialogDescription>修改记忆的内容和标签，KCL 机制将自动追踪本次修改的修订快照。</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1 text-left">
                  <label className="text-xs font-semibold text-muted-foreground">精炼摘要 (Summary)</label>
                  <Input
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    placeholder="请输入摘要"
                  />
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-xs font-semibold text-muted-foreground">具体内容 (Content)</label>
                  <textarea
                    className="w-full bg-background border border-border rounded-xl p-2 text-xs h-24 outline-none focus:border-brand"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="请输入详细内容"
                  />
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-xs font-semibold text-muted-foreground">标签 (Tags，英文逗号分隔)</label>
                  <Input
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="例如: customer, discount"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingMemory(null)}>取消</Button>
                <Button onClick={handleSaveEdit}>保存</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* 长期记忆修订历史 Dialog */}
        {viewingMemory && (
          <Dialog open={!!viewingMemory} onOpenChange={(open) => !open && setViewingMemory(null)}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>修订演化历史</DialogTitle>
                <DialogDescription>查看本条长期记忆的版本修订历史 (KCL 溯源链)</DialogDescription>
              </DialogHeader>
              <div className="max-h-[300px] overflow-y-auto space-y-4 py-4 pr-1 text-left">
                {(viewingMemory as any).revisions && (viewingMemory as any).revisions.length > 0 ? (
                  (viewingMemory as any).revisions.map((rev: any, index: number) => (
                    <div key={rev.id} className="border-l-2 border-brand pl-3 py-1 space-y-1.5 relative">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-brand">v{rev.version}</span>
                        <span className="text-[10px] text-muted-foreground">{formatTime(rev.createdAt)}</span>
                      </div>
                      <p className="text-xs font-semibold text-foreground">{rev.summary}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{rev.content}</p>
                      <div className="text-[9px] text-hint flex gap-3">
                        <span>修订人: {rev.editedBy}</span>
                        <span>原因: {rev.reason}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-xs text-muted-foreground py-4">暂无历史版本记录</p>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => setViewingMemory(null)}>关闭</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </PageTransition>
  );
}

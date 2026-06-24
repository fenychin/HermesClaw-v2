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
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageTransition } from "@/components/common/PageTransition";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMemoryStore } from "@/stores/memory-store";
import { SkeletonCard } from "@/components/common/skeleton-card";
import { apiClient } from "@/lib/api-client";
import type { Memory, MemoryType } from "@/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

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

function MemoryCard({ memory }: { memory: Memory }) {
  const { archiveMemory, freezeMemory, upgradeMemory } = useMemoryStore();

  const displayTime = useMemo(() => {
    if (memory.updatedAt && memory.updatedAt !== memory.createdAt) {
      return `更新于: ${formatTime(memory.updatedAt)}`;
    }
    return formatTime(memory.createdAt);
  }, [memory]);

  const friendlySource = useMemo(() => {
    if (memory.relatedAgent) return `智能体: ${memory.relatedAgent}`;
    if (memory.relatedProject) return `项目: ${memory.relatedProject}`;
    if (memory.source === "manual") return "人工录入 SOP";
    if (memory.source === "system") return "自演化引擎";
    return memory.source === "auto" ? "工作流捕获" : memory.source;
  }, [memory]);

  return (
    <div className="bg-card border-border rounded-xl border p-4 flex flex-col justify-between min-h-[160px]">
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

        <p className="text-foreground mb-3 line-clamp-3 text-sm leading-relaxed">
          {memory.summary}
        </p>

        {memory.tags.length > 0 && (
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

      <div className="border-border flex items-center gap-1 border-t pt-2.5 mt-2">
        {/* 短期记忆可以一键提升为中期或长期 */}
        {memory.type === "short" && (
          <>
            <button
              type="button"
              onClick={() => upgradeMemory(memory.id, "mid")}
              className="text-brand-blue hover:bg-brand-blue/10 inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors"
            >
              <ArrowUp className="size-3" />
              升至中期
            </button>
            <button
              type="button"
              onClick={() => upgradeMemory(memory.id, "long")}
              className="text-brand hover:bg-brand/10 inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors"
            >
              <ArrowUp className="size-3" />
              升至长期
            </button>
          </>
        )}
        
        {/* 中期记忆可以一键提升为长期 */}
        {memory.type === "mid" && (
          <button
            type="button"
            onClick={() => upgradeMemory(memory.id, "long")}
            className="text-brand hover:bg-brand/10 inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors"
          >
            <ArrowUp className="size-3" />
            升至长期
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (confirm(`确认归档记忆「${memory.summary}」？`)) {
              archiveMemory(memory.id, true).catch(() => {});
            }
          }}
          className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors"
        >
          <Archive className="size-3" />
          归档
        </button>

        <button
          type="button"
          onClick={() => freezeMemory(memory.id, !memory.frozen)}
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
          onClick={() => {
            if (confirm(`确认删除记忆「${memory.summary}」？此操作不可撤销。`)) {
              archiveMemory(memory.id, true).catch(() => {});
            }
          }}
          className="text-danger hover:bg-danger/10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors"
        >
          <Trash2 className="size-3" />
          删除
        </button>
      </div>
    </div>
  );
}

interface MemoryViewProps {
  /** 进入页面时默认激活的 tab；不传则沿用 store 当前值 */
  initialTab?: MemoryType;
}

export function MemoryView({ initialTab }: MemoryViewProps) {
  const activeTab = useMemoryStore((s) => s.activeTab);
  const setActiveTab = useMemoryStore((s) => s.setActiveTab);
  const memories = useMemoryStore((s) => s.memories);
  const loading = useMemoryStore((s) => s.loading);
  const error = useMemoryStore((s) => s.error);
  const loadMemories = useMemoryStore((s) => s.loadMemories);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchMsg, setBatchMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab, setActiveTab]);

  useEffect(() => {
    setSearchQuery("");
  }, [activeTab]);

  const memoriesByTab: Record<MemoryType, Memory[]> = useMemo(
    () => ({
      short: memories.filter((m) => m.type === "short"),
      mid: memories.filter((m) => m.type === "mid"),
      long: memories.filter((m) => m.type === "long"),
    }),
    [memories],
  );

  const filteredMemoriesByTab: Record<MemoryType, Memory[]> = useMemo(() => {
    const result: Record<MemoryType, Memory[]> = { short: [], mid: [], long: [] };
    const query = searchQuery.trim().toLowerCase();

    (Object.keys(memoriesByTab) as MemoryType[]).forEach((key) => {
      const list = memoriesByTab[key];
      if (!query) {
        result[key] = list;
      } else {
        result[key] = list.filter(
          (m) =>
            m.summary.toLowerCase().includes(query) ||
            (m.content && m.content.toLowerCase().includes(query)) ||
            (m.tags && m.tags.some((t) => t.toLowerCase().includes(query)))
        );
      }
    });
    return result;
  }, [memoriesByTab, searchQuery]);

  const tabs: { value: MemoryType; label: string; count: number }[] = useMemo(
    () => [
      { value: "short", label: "短期记忆", count: memoriesByTab.short.length },
      { value: "mid", label: "中期记忆", count: memoriesByTab.mid.length },
      { value: "long", label: "长期记忆", count: memoriesByTab.long.length },
    ],
    [memoriesByTab],
  );

  if (loading && memories.length === 0) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <PageHeader
            title="记忆体"
            description="短/中/长期三级记忆体系：实时会话 → 项目沉淀 → 企业知识"
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
        <div className="space-y-6">
          <PageHeader
            title="记忆体"
            description="短/中/长期三级记忆体系：实时会话 → 项目沉淀 → 企业知识"
          />
          <div className="flex flex-col items-center justify-center py-20">
            <div className="bg-danger/10 mb-4 flex size-14 items-center justify-center rounded-2xl">
              <AlertCircle className="text-danger size-7" />
            </div>
            <p className="text-foreground text-lg font-semibold">加载失败</p>
            <p className="text-muted-foreground mt-1 text-sm">{error}</p>
            <button
              type="button"
              onClick={loadMemories}
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
      <div className="space-y-6">
        <PageHeader
          title="记忆体"
          description="短/中/长期三级记忆体系：实时会话 → 项目沉淀 → 企业知识"
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
            <span>当前区间共 {memoriesByTab[activeTab].length} 条记忆</span>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as MemoryType)}
        >
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                <span className="bg-accent text-muted-foreground ml-1.5 rounded-full px-2 py-0.5 text-[10px]">
                  {tab.count}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((tab) => {
            const hasNoMemories = memoriesByTab[tab.value].length === 0;
            const hasNoFilteredResults = filteredMemoriesByTab[tab.value].length === 0;

            return (
              <TabsContent key={tab.value} value={tab.value} className="mt-4">
                {hasNoMemories ? (
                  <EmptyState
                    icon={Layers}
                    title={`暂无${TIER_LABEL[tab.value]}`}
                    description="随对话积累，系统将自动汇总和沉淀对应记忆"
                  />
                ) : hasNoFilteredResults ? (
                  <EmptyState
                    icon={Search}
                    title="未找到匹配的记忆"
                    description="请尝试调整搜索关键词"
                  />
                ) : (
                  <div className="space-y-3">
                    {/* 短期记忆批量操作（PRD #10.6.1：可清理、可合并转入中期记忆） */}
                    {tab.value === "short" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={batchLoading}
                            onClick={async () => {
                              if (!confirm(`确认清理全部 ${memoriesByTab.short.length} 条短期记忆？此操作不可撤销。`)) return;
                              setBatchLoading(true);
                              setBatchMsg(null);
                              const failed: string[] = [];
                              const ids = memoriesByTab.short.map((m) => ({ id: m.id, summary: m.summary }));
                              for (const { id, summary } of ids) {
                                try { await apiClient.deleteMemory(id, true); }
                                catch { failed.push(summary); }
                              }
                              await loadMemories();
                              if (failed.length > 0) {
                                setBatchMsg({ ok: false, text: `${failed.length} 条清理失败: ${failed.slice(0, 3).join("、")}${failed.length > 3 ? "…" : ""}` });
                              }
                              setBatchLoading(false);
                            }}
                            className="text-danger hover:bg-danger/10 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60"
                          >
                            {batchLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                            清理全部
                          </button>
                          <button
                            type="button"
                            disabled={batchLoading}
                            onClick={async () => {
                              if (!confirm(`确认将全部 ${memoriesByTab.short.length} 条短期记忆合并转入中期记忆？`)) return;
                              setBatchLoading(true);
                              setBatchMsg(null);
                              const failed: string[] = [];
                              const ids = memoriesByTab.short.map((m) => ({ id: m.id, summary: m.summary }));
                              for (const { id, summary } of ids) {
                                try { await apiClient.updateMemory(id, { type: "mid" }); }
                                catch { failed.push(summary); }
                              }
                              await loadMemories();
                              if (failed.length > 0) {
                                setBatchMsg({ ok: false, text: `${failed.length} 条升级失败: ${failed.slice(0, 3).join("、")}${failed.length > 3 ? "…" : ""}` });
                              }
                              setBatchLoading(false);
                            }}
                            className="text-brand-blue hover:bg-brand-blue/10 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60"
                          >
                            {batchLoading ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
                            合并转入中期记忆
                          </button>
                        </div>
                        {batchMsg && (
                          <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ${batchMsg.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                            <AlertCircle className="size-3.5 shrink-0" />
                            <span>{batchMsg.text}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      {filteredMemoriesByTab[tab.value].map((memory) => (
                        <MemoryCard key={memory.id} memory={memory} />
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </PageTransition>
  );
}

"use client";

import { useMemo, useEffect } from "react";
import { Layers, Lock, Archive, Trash2, Snowflake, ArrowUp, AlertCircle, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMemoryStore } from "@/stores/memory-store";
import { SkeletonCard } from "@/components/common/skeleton-card";
import type { Memory, MemoryType } from "@/types";
import { cn } from "@/lib/utils";

/** 记忆层级中文映射 */
const TIER_LABEL: Record<MemoryType, string> = {
  short: "短期记忆",
  mid: "中期记忆",
  long: "长期记忆",
};

/** 置信度颜色 */
function confidenceColor(confidence: number): string {
  if (confidence >= 0.9) return "text-success";
  if (confidence >= 0.7) return "text-warning";
  return "text-danger";
}

/** 格式化时间 */
function formatTime(iso: string): string {
  const date = new Date(iso);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");
  return `${month}月${day}日 ${hour}:${minute}`;
}

/** 单条记忆卡片 */
function MemoryCard({ memory }: { memory: Memory }) {
  const { archiveMemory, freezeMemory, upgradeMemory } = useMemoryStore();

  return (
    <div className="bg-card border-border rounded-xl border p-4">
      {/* 顶部：时间 + 来源 badge + confidence */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-muted-foreground shrink-0 text-xs">
          {formatTime(memory.createdAt)}
        </span>
        <span className="bg-accent text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
          {memory.source}
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
            confidenceColor(memory.confidence)
          )}
        >
          {Math.round(memory.confidence * 100)}%
        </span>
        {memory.frozen && (
          <Lock className="text-brand size-3.5 shrink-0" />
        )}
      </div>

      {/* 内容摘要 */}
      <p className="text-foreground mb-3 line-clamp-3 text-sm leading-relaxed">
        {memory.summary}
      </p>

      {/* 标签行 */}
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

      {/* 底部操作 */}
      <div className="border-border flex items-center gap-1 border-t pt-2.5">
        {/* 升级（仅 short / mid） */}
        {memory.type !== "long" && (
          <button
            type="button"
            onClick={() => upgradeMemory(memory.id)}
            className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
          >
            <ArrowUp className="size-3" />
            升级
          </button>
        )}

        {/* 归档 */}
        <button
          type="button"
          onClick={() => {
            if (confirm(`确认归档记忆「${memory.summary}」？`)) {
              archiveMemory(memory.id, true).catch(() => {});
            }
          }}
          className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
        >
          <Archive className="size-3" />
          归档
        </button>

        {/* 冻结 / 解冻 */}
        <button
          type="button"
          onClick={() => freezeMemory(memory.id, !memory.frozen)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
            memory.frozen
              ? "text-brand hover:bg-brand/10"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
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

        {/* 删除 */}
        <button
          type="button"
          onClick={() => {
            if (confirm(`确认删除记忆「${memory.summary}」？此操作不可撤销。`)) {
              archiveMemory(memory.id, true).catch(() => {});
            }
          }}
          className="text-danger hover:bg-danger/10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
        >
          <Trash2 className="size-3" />
          删除
        </button>
      </div>
    </div>
  );
}

/** 智慧大脑 → 记忆系统页 */
export default function MemoryPage() {
  const activeTab = useMemoryStore((s) => s.activeTab);
  const setActiveTab = useMemoryStore((s) => s.setActiveTab);
  const memories = useMemoryStore((s) => s.memories);
  const loading = useMemoryStore((s) => s.loading);
  const error = useMemoryStore((s) => s.error);
  const loadMemories = useMemoryStore((s) => s.loadMemories);

  // 挂载时加载记忆
  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const memoriesByTab: Record<MemoryType, Memory[]> = useMemo(
    () => ({
      short: memories.filter((m) => m.type === "short"),
      mid: memories.filter((m) => m.type === "mid"),
      long: memories.filter((m) => m.type === "long"),
    }),
    [memories]
  );

  const tabs: { value: MemoryType; label: string; count: number }[] = useMemo(
    () => [
      { value: "short", label: "短期记忆", count: memoriesByTab.short.length },
      { value: "mid", label: "中期记忆", count: memoriesByTab.mid.length },
      { value: "long", label: "长期记忆", count: memoriesByTab.long.length },
    ],
    [memoriesByTab]
  );

  // ---- 加载中骨架屏 ----
  if (loading && memories.length === 0) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <PageHeader
            icon={Layers}
            title="记忆系统"
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

  // ---- 错误状态 ----
  if (error && memories.length === 0) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <PageHeader
            icon={Layers}
            title="记忆系统"
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
        icon={Layers}
        title="记忆系统"
        description="短/中/长期三级记忆体系：实时会话 → 项目沉淀 → 企业知识"
      />

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

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-4">
            {memoriesByTab[tab.value].length === 0 ? (
              <div className="text-muted-foreground py-16 text-center text-sm">
                暂无{TIER_LABEL[tab.value]}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {memoriesByTab[tab.value].map((memory) => (
                  <MemoryCard key={memory.id} memory={memory} />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
    </PageTransition>
  );
}

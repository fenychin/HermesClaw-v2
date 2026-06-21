"use client";

import { useState, useMemo } from "react";
import { getOrgMemory } from "@/lib/api/brain";
import { useBrainFetch } from "@/hooks/use-brain-fetch";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/empty-state";
import { SkeletonCard } from "@/components/common/skeleton-card";
import { Input } from "@/components/ui/input";
import { Database, Search, Tag, Calendar, BookOpen } from "lucide-react";

interface Memory {
  id: string;
  type: string;
  content: string;
  summary: string;
  source: string;
  relatedProject?: string | null;
  relatedAgent?: string | null;
  confidence: number;
  frozen: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export default function MemoryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  
  // 使用封装好的公共中枢 Hook，完全物理隔离 workspace store
  const { data, loading, error } = useBrainFetch<{ memories: Memory[] }>(
    getOrgMemory,
    "default"
  );

  const memories = data?.memories || [];

  const filteredMemories = useMemo(() => {
    return memories.filter((m) => {
      const query = searchQuery.toLowerCase();
      return (
        m.summary.toLowerCase().includes(query) ||
        m.content.toLowerCase().includes(query) ||
        m.tags.some((t) => t.toLowerCase().includes(query))
      );
    });
  }, [memories, searchQuery]);

  return (
    <PageTransition>
      <div className="space-y-6 max-w-6xl mx-auto pb-12 select-none">
        <PageHeader
          title="Hermes 组织记忆中枢"
          description="企业级 SOP、沉淀项目摘要与组织级长期经验知识沉淀，支撑数字员工的全局决策上下文"
        />

        {/* 顶部过滤检索工具栏 */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card/60 border border-border/80 p-4 rounded-2xl backdrop-blur-md">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索长期组织记忆、标签或内容..."
              className="pl-9 bg-background/50 border-border focus:border-[#6D5EF9]/50 text-xs h-9 rounded-xl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 items-center text-xs text-muted-foreground bg-accent/30 px-3 py-1.5 rounded-lg border border-border/30">
            <Database className="size-3.5 text-[#6D5EF9]" />
            <span>已同步 {memories.length} 条组织级沉淀，用于生成全局意图检索底座</span>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} variant="card" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-card/30 border border-border rounded-2xl backdrop-blur-sm">
            <p className="text-destructive text-sm font-medium">数据加载失败</p>
            <p className="text-muted-foreground text-xs mt-1">{error}</p>
          </div>
        ) : filteredMemories.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="暂无组织记忆条目"
            description="当智能体执行完成后，符合自演化的长期经验会自动沉淀至此"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredMemories.map((memory) => (
              <div
                key={memory.id}
                className="bg-card/50 border border-border/60 rounded-2xl p-5 flex flex-col justify-between min-h-[180px] shadow-sm relative overflow-hidden backdrop-blur-sm hover:border-border transition-all duration-200"
              >
                <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-[#6D5EF9]/5 rounded-full blur-xl pointer-events-none" />
                
                <div>
                  {/* 卡片头部 */}
                  <div className="flex items-center gap-2 mb-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {new Date(memory.updatedAt).toLocaleDateString()}
                    </span>
                    <span className="bg-accent/80 text-muted-foreground rounded-full px-2 py-0.5 font-medium">
                      来源: {memory.source === "manual" ? "管理员录入" : "自演化引擎"}
                    </span>
                    <div className="flex-1" />
                    <span className="text-[#6D5EF9] font-semibold bg-[#6D5EF9]/10 px-2 py-0.5 rounded-full">
                      置信度 {Math.round(memory.confidence * 100)}%
                    </span>
                  </div>

                  {/* 摘要与详情 */}
                  <h4 className="text-foreground font-semibold text-xs mb-2">
                    {memory.summary}
                  </h4>
                  <p className="text-muted-foreground text-[11px] leading-relaxed mb-4 whitespace-pre-wrap">
                    {memory.content}
                  </p>
                </div>

                {/* 卡片底部标签 */}
                {memory.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-auto pt-3 border-t border-border/20">
                    {memory.tags.map((tag) => (
                      <span
                        key={tag}
                        className="bg-accent text-muted-foreground/80 rounded-md px-1.5 py-0.5 text-[9px] flex items-center gap-0.5"
                      >
                        <Tag className="size-2.5 text-[#6D5EF9]" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}

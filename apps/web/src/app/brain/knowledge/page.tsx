"use client";

import { useState, useMemo } from "react";
import { getKnowledgePacks } from "@/lib/api/brain";
import { useBrainFetch } from "@/hooks/use-brain-fetch";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { SkeletonCard } from "@/components/common/skeleton-card";
import { FileText, Search, Database, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";

interface KnowledgeItem {
  id: string;
  title: string;
  category: string;
  content: string;
  lastUpdated: string;
  source: string;
  usages: string;
}

export default function KnowledgePage() {
  const [searchQuery, setSearchQuery] = useState("");

  // 使用封装好的公共中枢 Hook，完全物理隔离 workspace store
  const { data, loading, error } = useBrainFetch<{ knowledge: KnowledgeItem[] }>(
    getKnowledgePacks,
    "default"
  );

  const knowledgeList = data?.knowledge || [];

  const filteredKnowledge = useMemo(() => {
    return knowledgeList.filter((item) => {
      const query = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(query) ||
        item.content.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      );
    });
  }, [knowledgeList, searchQuery]);

  return (
    <PageTransition>
      <div className="space-y-6 max-w-6xl mx-auto pb-12 select-none">
        <PageHeader
          title="企业自上演化知识库"
          description="面向多岗位智能体、开发信自动生成与报价工作流底座 of 结构化企业规则、SOP 与通用知识中枢"
        />

        {/* 顶部检索与分析卡 */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card/50 border border-border/60 p-4 rounded-2xl backdrop-blur-sm">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索知识条目、SOP、标签..."
              className="pl-9 bg-background/50 border-border focus:border-[#6D5EF9]/50 text-xs h-9 rounded-xl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 items-center text-xs text-muted-foreground bg-accent/30 px-3 py-1.5 rounded-lg border border-border/30">
            <Database className="size-3.5 text-[#6D5EF9]" />
            <span>已同步 {knowledgeList.length} 项知识库规则以驱动大模型路由与 SOP 编排</span>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} variant="list-item" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-card/30 border border-border rounded-2xl backdrop-blur-sm">
            <p className="text-destructive text-sm font-medium">数据加载失败</p>
            <p className="text-muted-foreground text-xs mt-1">{error}</p>
          </div>
        ) : filteredKnowledge.length === 0 ? (
          <div className="text-center py-12 bg-card/30 border border-dashed border-border rounded-2xl backdrop-blur-sm">
            <span className="text-muted-foreground text-xs">未搜索到相关知识条目</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredKnowledge.map((item) => (
              <div
                key={item.id}
                className="bg-card/40 hover:bg-card/60 border border-border/50 hover:border-border/80 rounded-2xl p-6 transition-all duration-200 flex flex-col justify-between relative overflow-hidden group shadow-sm backdrop-blur-sm"
              >
                <div className="flex justify-between items-start mb-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-[#6D5EF9]/10 text-[#6D5EF9] px-2 py-0.5 rounded-full font-semibold">
                        {item.category}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {item.id}
                      </span>
                    </div>
                    <h3 className="text-foreground font-semibold text-xs group-hover:text-[#6D5EF9] transition-colors flex items-center gap-1.5">
                      <FileText className="size-4 shrink-0 text-muted-foreground group-hover:text-[#6D5EF9]" />
                      {item.title}
                    </h3>
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    更新时间: {item.lastUpdated}
                  </div>
                </div>

                <p className="text-muted-foreground text-[11px] leading-relaxed mb-4">
                  {item.content}
                </p>

                <div className="border-t border-border/30 pt-3 flex flex-wrap gap-y-2 items-center justify-between text-[10px] text-muted-foreground">
                  <div className="flex gap-4">
                    <span>
                      知识来源: <strong className="text-foreground/80 font-medium">{item.source}</strong>
                    </span>
                    <span>
                      应用场景: <strong className="text-foreground/80 font-medium">{item.usages}</strong>
                    </span>
                  </div>
                  <div className="flex gap-1.5 font-medium">
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] px-2 py-0.5 rounded-md flex items-center gap-1">
                      <CheckCircle2 className="size-3" />
                      已映射至 Hermes 控制核
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}

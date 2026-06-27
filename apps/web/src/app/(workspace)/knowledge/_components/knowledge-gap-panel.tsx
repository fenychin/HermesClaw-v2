"use client";

import { memo } from "react";
import {
  Puzzle,
  AlertTriangle,
  Info,
  Zap,
  BookOpen,
  Lightbulb,
  FileWarning,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { KnowledgeGap, KnowledgeGapType } from "@/types";

interface KnowledgeGapPanelProps {
  gaps: KnowledgeGap[];
  loading?: boolean;
}

const GAP_TYPE_CONFIG: Record<KnowledgeGapType, { label: string; icon: typeof Puzzle; color: string }> = {
  missing_sop: { label: "缺失流程", icon: FileWarning, color: "text-amber-500 bg-amber-500/10" },
  missing_fact: { label: "缺失事实", icon: Info, color: "text-blue-500 bg-blue-500/10" },
  missing_rule: { label: "缺失规则", icon: Lightbulb, color: "text-purple-500 bg-purple-500/10" },
  stale_knowledge: { label: "知识陈旧", icon: AlertTriangle, color: "text-danger bg-danger/10" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: "紧急", color: "text-danger bg-danger/10 border-danger/30" },
  high: { label: "高", color: "text-amber-500 bg-amber-500/10 border-amber-500/30" },
  medium: { label: "中", color: "text-blue-500 bg-blue-500/10 border-blue-500/30" },
  low: { label: "低", color: "text-muted-foreground bg-accent border-border" },
};

/**
 * 知识缺口面板 — 展示 AI 识别出但尚未填补的知识空白
 * —— 每项说明缺口类型、影响范围、建议来源、优先级
 */
export const KnowledgeGapPanel = memo(function KnowledgeGapPanel({
  gaps,
  loading,
}: KnowledgeGapPanelProps) {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">加载知识缺口...</span>
      </div>
    );
  }

  if (gaps.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Puzzle className="size-4 text-success" />
          <span className="text-sm font-medium text-foreground">暂无知识缺口</span>
        </div>
        <p className="text-xs text-muted-foreground">
          AI 引擎尚未识别出需要补充的知识空白，记忆库覆盖完整
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* 面板标题 */}
      <div className="bg-accent/50 border-b border-border px-4 py-2.5 flex items-center gap-2">
        <Puzzle className="size-4 text-brand" />
        <span className="text-sm font-semibold text-foreground">知识缺口</span>
        <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
          {gaps.length}
        </Badge>
        <span className="text-[10px] text-muted-foreground ml-auto">
          AI 识别出但尚未填补的知识空白
        </span>
      </div>

      {/* 缺口列表 */}
      <div className="divide-y divide-border">
        {gaps.map((gap) => {
          const typeCfg = GAP_TYPE_CONFIG[gap.type] || GAP_TYPE_CONFIG.missing_fact;
          const TypeIcon = typeCfg.icon;
          const priorityCfg = PRIORITY_CONFIG[gap.priority] || PRIORITY_CONFIG.medium;

          return (
            <div key={gap.id} className="px-4 py-3 hover:bg-accent/30 transition-colors">
              <div className="flex items-start gap-3">
                {/* 类型图标 */}
                <div className={cn("flex size-8 items-center justify-center rounded-lg shrink-0 mt-0.5", typeCfg.color.split(" ")[1])}>
                  <TypeIcon className={cn("size-4", typeCfg.color.split(" ")[0])} />
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  {/* 标题行 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">
                      {gap.title}
                    </span>
                    <Badge variant="outline" className={cn("px-1.5 py-0 text-[9px]", priorityCfg.color)}>
                      {priorityCfg.label}
                    </Badge>
                    <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                      {typeCfg.label}
                    </Badge>
                  </div>

                  {/* 描述 */}
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {gap.description}
                  </p>

                  {/* 影响范围 + 建议来源 */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-hint">
                    <span>
                      影响: {gap.impact}
                    </span>
                    {gap.suggestedSource && (
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="size-2.5" />
                        建议来源: {gap.suggestedSource}
                      </span>
                    )}
                    {gap.affectedWorkflows && gap.affectedWorkflows.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Zap className="size-2.5" />
                        影响 {gap.affectedWorkflows.length} 个工作流
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className="size-4 text-hint shrink-0 mt-1" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

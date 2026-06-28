"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Mail,
  FileText,
  UserSearch,
  FolderPlus,
  Bot,
  Workflow,
} from "lucide-react";

const iconMap: Record<string, any> = {
  "inquiry-grade": Search,
  "dev-letter": Mail,
  "quote-gen": FileText,
  "customer-profile": UserSearch,
  "project-space": FolderPlus,
  "agent-dispatch": Bot,
};

const colorMap: Record<string, string> = {
  "inquiry-grade": "text-brand-blue",
  "dev-letter": "text-primary",
  "quote-gen": "text-success",
  "customer-profile": "text-warning",
  "project-space": "text-primary",
  "agent-dispatch": "text-brand-blue",
};

/** 卡片入场动画延迟（逐行错开） */
const STAGGER_DELAY = 0.04;

interface QuickCardsProps {
  actions?: any[];
  loading?: boolean;
  onSelect?: (prompt: string, systemPrompt?: string) => void;
  onWorkflowSelect?: (cardKey: string) => void;
}

/** 默认快捷卡片（工作流入口），与 quick-workflow-form.tsx 中的 WORKFLOW_CONFIGS 对齐 */
const DEFAULT_ACTIONS = [
  { id: "inquiry-grade", label: "分析询盘", prompt: "", systemPrompt: "" },
  { id: "dev-letter", label: "生成开发信", prompt: "", systemPrompt: "" },
  { id: "quote-gen", label: "生成报价单", prompt: "", systemPrompt: "" },
  { id: "customer-profile", label: "客户画像", prompt: "", systemPrompt: "" },
  { id: "project-space", label: "项目空间", prompt: "", systemPrompt: "" },
  { id: "agent-dispatch", label: "智能体调度", prompt: "", systemPrompt: "" },
];

export function QuickCards({ actions, loading, onSelect, onWorkflowSelect }: QuickCardsProps) {
  const cards = actions ?? DEFAULT_ACTIONS;
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-row items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border"
          >
            <Skeleton className="size-4 rounded-full shrink-0" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((card, i) => {
        const Icon = iconMap[card.id] || Workflow;
        const colorClass = colorMap[card.id] || "text-muted-foreground";

        const handleClick = () => {
          if (onWorkflowSelect) {
            onWorkflowSelect(card.id);
          } else if (onSelect) {
            onSelect(card.prompt || "", card.systemPrompt);
          }
        };

        return (
          <motion.button
            key={card.id}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.2,
              delay: 0.05 + i * STAGGER_DELAY,
              ease: "easeOut",
            }}
            onClick={handleClick}
            className={cn(
              "flex flex-row items-center gap-2 px-3 py-2.5 rounded-xl",
              "bg-card border border-border",
              "cursor-pointer text-left",
              "hover:bg-accent hover:border-muted-foreground/20",
              "transition-colors",
            )}
          >
            {/* 图标 */}
            <Icon className={cn("size-4 shrink-0", colorClass)} />

            {/* 标题 */}
            <span className="text-foreground text-[11px] font-medium leading-tight truncate">
              {card.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

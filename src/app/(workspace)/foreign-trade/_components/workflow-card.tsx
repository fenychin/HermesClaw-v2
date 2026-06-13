"use client";

import { useRouter } from "next/navigation";
import {
  Filter,
  Mail,
  User,
  FileText,
  Package,
  TrendingUp,
  Users,
  Bell,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TradeWorkflow } from "../_data/workflows";

// ============================================================
// 图标动态映射表（Lucide 按字符串名称解析）
// ============================================================
const ICON_MAP = {
  Filter,
  Mail,
  User,
  FileText,
  Package,
  TrendingUp,
  Users,
  Bell,
} as const;

type IconName = keyof typeof ICON_MAP;

interface WorkflowCardProps {
  workflow: TradeWorkflow;
}

/**
 * 工作流入口卡片
 * 点击后跳转 /foreign-trade/workflows/[id]
 */
export function WorkflowCard({ workflow }: WorkflowCardProps) {
  const router = useRouter();
  // 安全取图标，找不到时回退到 FileText
  const Icon = ICON_MAP[workflow.icon as IconName] ?? FileText;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/foreign-trade/workflows/${workflow.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          router.push(`/foreign-trade/workflows/${workflow.id}`);
        }
      }}
      className={cn(
        "bg-card rounded-2xl border border-border p-4",
        "hover:border-primary/40 hover:shadow-sm",
        "cursor-pointer transition-all duration-200",
        "group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
      )}
    >
      {/* 图标区 */}
      <div className="bg-primary/10 inline-flex rounded-xl p-2">
        <Icon className="size-5 text-primary" />
      </div>

      {/* 标题 */}
      <h3 className="text-foreground mt-3 text-sm font-medium">
        {workflow.title}
      </h3>

      {/* 描述 */}
      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
        {workflow.description}
      </p>

      {/* 底部行动区 */}
      <div className="mt-3 flex items-center gap-1">
        <span className="text-primary text-xs font-medium">立即使用</span>
        <ArrowRight className="text-primary size-3 transition-transform duration-150 group-hover:translate-x-0.5" />
      </div>
    </div>
  );
}

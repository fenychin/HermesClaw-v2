"use client";

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
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflowChatBridge } from "@/hooks/use-workflow-chat-bridge";
import type { TradeWorkflow } from "./workflow-types";

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
  /** 当前选中的询盘 ID（来自上游页面的 selectedInquiry?.id） */
  selectedInquiryId?: string;
  /** 当前工作空间 ID（必填，用于 contextPayload 与审计追踪） */
  workspaceId: string;
  /** 关联的行业包 ID，传入后将在 systemPrompt 中注入行业包技能清单 */
  industryPackId?: string;
}

/**
 * 工作流入口卡片
 *
 * 点击后通过 useWorkflowChatBridge 完成完整闭环：
 * 1. POST /api/workflows/run → 获取 runId
 * 2. POST /api/tasks/dispatch → 写 AuditLog + 派生 Task
 * 3. 构建 systemPrompt（含行业包技能清单）→ 注入 useUiStore
 * 4. 跳转 /workspace/chat?workflowRunId=...&workflowId=...&intent=...
 */
export function WorkflowCard({
  workflow,
  selectedInquiryId,
  workspaceId,
  industryPackId,
}: WorkflowCardProps) {
  const { triggerWorkflow, isTriggering, error } = useWorkflowChatBridge();

  // 安全取图标，找不到时回退到 FileText
  const Icon = ICON_MAP[workflow.icon as IconName] ?? FileText;

  const handleClick = () => {
    if (isTriggering) return;

    void triggerWorkflow({
      workflowId: workflow.id,
      workflowTitle: workflow.title,
      contextPayload: {
        inquiryId: selectedInquiryId,
        workspaceId,
        industryPackId,
      },
      industryPackId,
    });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "bg-card rounded-2xl border border-border p-4",
        "hover:border-primary/40 hover:shadow-sm",
        "cursor-pointer transition-all duration-200",
        "group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        isTriggering && "opacity-70 pointer-events-none",
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
        {isTriggering ? (
          <>
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span className="text-primary text-xs font-medium">
              正在准备...
            </span>
          </>
        ) : (
          <>
            <span className="text-primary text-xs font-medium">立即使用</span>
            <ArrowRight className="text-primary size-3 transition-transform duration-150 group-hover:translate-x-0.5" />
          </>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-red-500 text-xs leading-snug">
          <AlertCircle className="size-3 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

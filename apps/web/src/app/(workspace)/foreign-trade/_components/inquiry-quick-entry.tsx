"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  ChevronRight,
  User,
  MapPin,
  Flag,
  FileText,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflowChatBridge } from "@/hooks/use-workflow-chat-bridge";

// ═══════════════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════════════

/**
 * 询盘记录 — 覆盖 page-client 中 selectedInquiry 的实际形状。
 *
 * 来源：页面从询盘列表 API 返回的数组项，字段由 `any` 类型派生。
 * 与 @/types/trade 的 Inquiry 不完全一致（API 返回额外字段），
 * 故此处单独定义组件所需的最小字段集。
 */
export interface InquiryRecord {
  id: string;
  customerName?: string;
  country?: string;
  countryFlag?: string;
  priority?: "high" | "mid" | "low";
  product?: string;
  status?: string;
}

export interface InquirySmartTriggerProps {
  /** 当前选中的询盘（来自上游页面 state）；为 null 时展示占位引导 */
  selectedInquiry?: InquiryRecord | null;
  /** 当前工作空间 ID（必填） */
  workspaceId: string;
  /** 关联的行业包 ID */
  industryPackId?: string;
}

// ═══════════════════════════════════════════════════════════════════
// 内部常量
// ═══════════════════════════════════════════════════════════════════

/** 询盘跟进工作流 ID（对齐行业包 manifest） */
const INQUIRY_FOLLOW_UP_WORKFLOW_ID = "inquiry-follow-up-workflow";

/** 优先级展示配置 */
const PRIORITY_CONFIG: Record<string, { label: string; className: string }> =
  {
    high: {
      label: "高优先 · A 级",
      className:
        "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
    },
    mid: {
      label: "中等 · B 级",
      className:
        "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    },
    low: {
      label: "低优先 · C 级",
      className:
        "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
    },
  };

// ═══════════════════════════════════════════════════════════════════
// 纯函数
// ═══════════════════════════════════════════════════════════════════

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

// ═══════════════════════════════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════════════════════════════

/**
 * 询盘智能触发器
 *
 * AI-First 重构版：
 * - 有选中询盘 → 卡片摘要 + 一键触发完整 Workflow 闭环
 * - 无选中询盘 → 占位引导，引导用户从列表选择
 *
 * 所有执行通过 useWorkflowChatBridge 代理：
 *   1. POST /api/workflows/run
 *   2. POST /api/tasks/dispatch
 *   3. 注入 systemPrompt → 跳转聊天页面
 */
export function InquirySmartTrigger({
  selectedInquiry,
  workspaceId,
  industryPackId,
}: InquirySmartTriggerProps) {
  const { triggerWorkflow, isTriggering, error } = useWorkflowChatBridge();

  const [isExpanded, setIsExpanded] = useState(false);

  const hasInquiry = !!selectedInquiry;

  // ── 事件处理 ──────────────────────────────────────────────

  const handleTrigger = () => {
    if (!selectedInquiry || isTriggering) return;

    void triggerWorkflow({
      workflowId: INQUIRY_FOLLOW_UP_WORKFLOW_ID,
      workflowTitle: "询盘智能跟进",
      contextPayload: {
        inquiryId: selectedInquiry.id,
        customerName: selectedInquiry.customerName,
        product: selectedInquiry.product,
        priority: selectedInquiry.priority,
        workspaceId,
      },
      industryPackId,
    });
  };

  // ── UI 子元素 ─────────────────────────────────────────────

  const inquirySummary = hasInquiry ? (
    <div className="space-y-2.5">
      {/* 客户名 + 状态标签 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="size-3.5 text-muted-foreground" />
          <span className="text-foreground text-sm font-semibold">
            {selectedInquiry!.customerName ?? "未知客户"}
          </span>
        </div>
        {selectedInquiry!.status && (
          <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-medium border border-primary/20">
            {selectedInquiry!.status}
          </span>
        )}
      </div>

      {/* 国家 + 优先级 */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3" />
          {selectedInquiry!.countryFlag ?? ""}{" "}
          {selectedInquiry!.country ?? "未知"}
        </span>
        {selectedInquiry!.priority && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium",
              PRIORITY_CONFIG[selectedInquiry!.priority]?.className ??
                PRIORITY_CONFIG.low.className,
            )}
          >
            <Flag className="size-2.5" />
            {PRIORITY_CONFIG[selectedInquiry!.priority]?.label ??
              selectedInquiry!.priority}
          </span>
        )}
      </div>

      {/* 询盘内容摘要 */}
      {selectedInquiry!.product && (
        <div className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground bg-background/50 rounded-lg p-2.5 border border-border/50">
          <FileText className="size-3 shrink-0 mt-px" />
          <span>{truncateText(selectedInquiry!.product, 100)}</span>
        </div>
      )}
    </div>
  ) : null;

  const triggerButton = hasInquiry ? (
    <button
      type="button"
      onClick={handleTrigger}
      disabled={isTriggering}
      className={cn(
        "w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all",
        isTriggering
          ? "bg-primary/40 text-primary/60 cursor-not-allowed"
          : "bg-primary text-white hover:bg-primary/90 active:scale-[0.99]",
      )}
    >
      {isTriggering ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          正在准备...
        </>
      ) : (
        <>
          <Sparkles className="size-4" />
          AI 一键处理此询盘
        </>
      )}
    </button>
  ) : null;

  const errorBanner =
    error && hasInquiry ? (
      <div className="flex items-start gap-1.5 text-danger text-xs leading-snug bg-danger/5 rounded-lg p-2.5 border border-danger/20">
        <AlertCircle className="size-3 shrink-0 mt-px" />
        <span>{error}</span>
      </div>
    ) : null;

  const emptyPlaceholder = !hasInquiry ? (
    <div className="flex flex-col items-center justify-center text-center py-5 px-4 space-y-2.5 text-hint">
      <div className="bg-accent/40 rounded-xl p-2.5">
        <Sparkles className="size-5 opacity-50" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground/60">
          请先从询盘列表选中一条询盘
        </p>
        <p className="text-xs mt-0.5 leading-relaxed max-w-70">
          AI 将自动读取询盘内容，完成智能分级、开发信生成与跟进计划
        </p>
      </div>
      <ChevronRight className="size-4 animate-bounce opacity-30 mt-1" />
    </div>
  ) : null;

  // ── 折叠判断 ─────────────────────────────────────────────
  // 仅「有选中询盘 + 用户主动展开」时才显示完整面板；
  // 无选中询盘时始终展示占位引导（不可折叠）。

  const showExpanded = hasInquiry && isExpanded;

  // ── Render ───────────────────────────────────────────────

  return (
    <section>
      <p className="text-foreground font-medium mb-3 text-sm">快速入口</p>

      {/* 收起态 */}
      {!showExpanded && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (hasInquiry) setIsExpanded(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              if (hasInquiry) setIsExpanded(true);
            }
          }}
          className={cn(
            "bg-card rounded-2xl border p-4 transition-all duration-200",
            "group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            hasInquiry
              ? "border-primary/20 hover:border-primary/40 hover:shadow-sm cursor-pointer"
              : "border-dashed border-border/60 cursor-default",
          )}
        >
          {hasInquiry ? (
            /* 有选中询盘：收起态卡片摘要 */
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="bg-primary/20 rounded-xl p-2 shrink-0">
                  <Sparkles className="size-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm font-medium truncate">
                    {selectedInquiry!.customerName ?? "询盘智能处理"}
                  </p>
                  <p className="text-muted-foreground text-xs mt-0.5 truncate">
                    {selectedInquiry!.product
                      ? truncateText(selectedInquiry!.product, 60)
                      : "AI 自动分级 · 一键生成开发信"}
                  </p>
                </div>
                <div className="bg-primary/10 rounded-lg px-2.5 py-1 text-primary text-xs font-medium group-hover:bg-primary/20 transition-colors shrink-0">
                  展开处理
                </div>
              </div>
              {/* 收起态也允许直接触发 */}
              <div className="flex flex-col gap-2">
                {triggerButton}
                {errorBanner}
              </div>
            </div>
          ) : (
            /* 无选中询盘：占位引导 */
            emptyPlaceholder
          )}
        </div>
      )}

      {/* 展开态：上下文摘要 + 一键触发 */}
      {showExpanded && (
        <div className="bg-card rounded-2xl border border-primary/30 p-5">
          {/* 头部 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="bg-primary/20 rounded-lg p-1.5">
                <Sparkles className="size-4 text-primary" />
              </div>
              <h3 className="text-foreground text-sm font-semibold">
                询盘智能处理
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-hint hover:text-muted-foreground text-xs transition-colors"
            >
              收起
            </button>
          </div>

          {/* 询盘上下文摘要 */}
          <div className="bg-background/40 rounded-xl border border-border/50 p-4 mb-4">
            {inquirySummary}
          </div>

          {/* 一键触发按钮 */}
          <div className="space-y-2.5">
            {triggerButton}
            {errorBanner}
          </div>

          {/* 提示 */}
          <p className="text-hint text-[11px] text-center mt-3">
            点击按钮后将自动构建 AI 执行上下文并跳转至助手对话页面
          </p>
        </div>
      )}

      {/* 展开态 + 正在触发时的卡片级蒙版 */}
      {showExpanded && isTriggering && (
        <div className="mt-2 flex items-center justify-center gap-1.5 text-muted-foreground text-xs">
          <Loader2 className="size-3 animate-spin" />
          <span>正在跳转至 AI 助手...</span>
        </div>
      )}
    </section>
  );
}

/**
 * 旧名称兼容导出 — 调用方（page-client.tsx）可以用旧名称引用新组件，
 * 后续一次性批量改名时只需改 import 名称。
 */
export { InquirySmartTrigger as InquiryQuickEntry };

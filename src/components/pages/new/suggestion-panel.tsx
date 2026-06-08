"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Workflow,
  Zap,
  Sparkles,
  Bot,
  FolderKanban,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useAgentStore } from "@/stores/agent-store";
import { useTradeStore } from "@/stores/trade-store";
import { apiClient } from "@/lib/api-client";
import type { HermesSuggestion, SuggestionRelatedTo } from "@/types";

// ============================================================
// 映射：relatedTo → 图标 + 标签
// ============================================================

const RELATED_META: Record<
  SuggestionRelatedTo,
  { icon: typeof Bot; label: string }
> = {
  agents: { icon: Bot, label: "智能体" },
  projects: { icon: FolderKanban, label: "项目" },
  harness: { icon: ShieldCheck, label: "Harness" },
};

// ============================================================
// 映射：priority → 徽章 variant + 文本
// ============================================================

const PRIORITY_META: Record<
  HermesSuggestion["priority"],
  { variant: "destructive" | "outline" | "secondary"; text: string }
> = {
  high: { variant: "destructive", text: "高优先" },
  mid: { variant: "outline", text: "建议" },
  low: { variant: "secondary", text: "可选" },
};

// ============================================================
// 区块 2：推荐工作流映射（沿用 existing trade-store）
// ============================================================

/** 情报类型 → 工作流名称映射 */
const WORKFLOW_MAP: Record<string, { name: string; desc: string }> = {
  currency: { name: "汇率波动应对", desc: "锁定汇率、更新报价、评估汇兑影响" },
  tariff: { name: "关税政策监控", desc: "追踪关税变化、评估产品受影响范围" },
  competitor: { name: "竞品动态追踪", desc: "采集竞品定价与新品发布情报" },
  market: { name: "市场机会挖掘", desc: "分析行业增长趋势，识别新市场机会" },
  logistics: { name: "物流成本优化", desc: "对比运价、评估替代线路与多式联运" },
};

// ============================================================
// 组件
// ============================================================

interface SuggestionPanelProps {
  /** 点击智能体时 @mention */
  onMentionAgent?: (agentName: string) => void;
  /** 点击建议/工作流时将文本填入输入框 */
  onSelectSuggestion?: (text: string) => void;
}

/**
 * 智能建议面板（右栏）
 * —— 今日 AI 建议（由 /api/hermes/suggestions 动态生成）|
 *    推荐工作流（贸易情报）| 活跃智能体
 *
 * 体现 AGENTS.md「AI 是第一工程主体」：Hermes 主动基于系统状态给出工作建议。
 */
export function SuggestionPanel({
  onMentionAgent,
  onSelectSuggestion,
}: SuggestionPanelProps) {
  const storeAgents = useAgentStore((s) => s.agents);
  const storeIntelligence = useTradeStore((s) => s.intelligence);

  // ---- 今日 AI 建议 ----
  const {
    data: suggestionsResult,
    isLoading: suggestionsLoading,
    isError: suggestionsError,
    refetch: refetchSuggestions,
  } = useQuery({
    queryKey: ["hermes-suggestions"],
    queryFn: () => apiClient.getHermesSuggestions(),
    // 进入 /new 页即刷新，体现「主动」语义；后续切 Tab 复用缓存
    refetchOnMount: true,
  });

  const suggestions = suggestionsResult?.suggestions ?? [];
  // 错误降级（API 不可用时保持页面可用）
  // 无需单独 error toast — Skeleton→error 过渡已足够明显

  const topIntelligence = useMemo(
    () => storeIntelligence.slice(0, 2),
    [storeIntelligence],
  );

  const runningAgents = useMemo(
    () => storeAgents.filter((a) => a.status === "running").slice(0, 2),
    [storeAgents],
  );

  return (
    <motion.aside
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.05, ease: "easeOut" }}
      className="flex flex-col h-full gap-5"
    >
      {/* ======== 区块 1：今日 AI 建议 ======== */}
      <section>
        <div className="flex items-center gap-2 mb-3 px-1">
          <Sparkles className="size-4 text-primary" />
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            今日 AI 建议
          </span>
          {/* 后台静默刷新 */}
          <button
            type="button"
            onClick={() => refetchSuggestions()}
            className="ml-auto text-hint hover:text-muted-foreground transition-colors"
            title="刷新建议"
          >
            <RefreshCw className="size-3" />
          </button>
        </div>

        {/* ---- 加载中：3 条骨架屏 ---- */}
        {suggestionsLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="border-border rounded-xl border p-3.5 space-y-2"
              >
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <div className="flex items-center gap-2 mt-2">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- 错误：降级展示（允许手动刷新）---- */}
        {suggestionsError && !suggestionsLoading && (
          <div className="border-border bg-card rounded-xl border p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <AlertCircle className="size-4" />
              今日建议暂不可用
            </div>
            <button
              type="button"
              onClick={() => refetchSuggestions()}
              className="text-brand text-xs hover:underline"
            >
              点击重试
            </button>
          </div>
        )}

        {/* ---- 成功：真实 AI 建议 ---- */}
        {!suggestionsLoading && !suggestionsError && suggestions.length > 0 && (
          <div className="space-y-2.5">
            {suggestions.map((s, i) => {
              const relatedMeta = RELATED_META[s.relatedTo];
              const RelatedIcon = relatedMeta.icon;
              const priorityMeta = PRIORITY_META[s.priority];

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.2,
                    delay: 0.12 + i * 0.05,
                    ease: "easeOut",
                  }}
                  className="bg-card border border-border rounded-xl p-3.5 space-y-2"
                >
                  {/* 标题 */}
                  <p className="text-foreground text-xs font-medium leading-tight">
                    {s.title}
                  </p>
                  {/* 行动描述 */}
                  <p className="text-muted-foreground text-[11px] leading-relaxed line-clamp-2">
                    {s.action}
                  </p>

                  {/* 元信息行：priority badge + relatedTo 图标 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={priorityMeta.variant}
                      className="h-5 text-[10px]"
                    >
                      {priorityMeta.text}
                    </Badge>
                    <span className="flex items-center gap-1 text-hint text-[10px]">
                      <RelatedIcon className="size-3" />
                      {relatedMeta.label}
                    </span>
                  </div>

                  {/* 执行按钮 */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1.5 h-7 text-[11px] gap-1.5 rounded-lg"
                    onClick={() => onSelectSuggestion?.(s.action)}
                  >
                    执行
                  </Button>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* ======== 分隔线 ======== */}
      <div className="border-t border-border" />

      {/* ======== 区块 2：推荐工作流 ======== */}
      <section>
        <div className="flex items-center gap-2 mb-3 px-1">
          <Workflow className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            推荐工作流
          </span>
        </div>

        <div className="space-y-2.5">
          {topIntelligence.map((intel, i) => {
            const wf = WORKFLOW_MAP[intel.type] ?? {
              name: intel.title.slice(0, 10),
              desc: intel.summary.slice(0, 30),
            };
            return (
              <motion.div
                key={intel.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.2,
                  delay: 0.22 + i * 0.06,
                  ease: "easeOut",
                }}
                className="bg-card border border-border rounded-xl p-3.5"
              >
                <p className="text-foreground text-xs font-medium leading-tight">
                  {wf.name}
                </p>
                <p className="text-hint text-[11px] mt-1 leading-relaxed line-clamp-2">
                  {wf.desc}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2.5 h-7 text-[11px] gap-1.5 rounded-lg"
                  onClick={() =>
                    onSelectSuggestion?.(
                      `执行"${wf.name}"工作流：${wf.desc}`,
                    )
                  }
                >
                  执行
                </Button>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ======== 分隔线 ======== */}
      <div className="border-t border-border" />

      {/* ======== 区块 3：活跃智能体 ======== */}
      <section>
        <div className="flex items-center gap-2 mb-3 px-1">
          <Zap className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            活跃智能体
          </span>
        </div>

        <div className="space-y-1.5">
          {runningAgents.map((agent, i) => (
            <motion.button
              key={agent.id}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.2,
                delay: 0.28 + i * 0.05,
                ease: "easeOut",
              }}
              onClick={() => onMentionAgent?.(agent.name)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors text-left group"
            >
              {/* 状态点（脉冲） */}
              <span className="relative flex size-2.5 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-success" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-foreground text-xs font-medium truncate">
                  {agent.name}
                </p>
                <p className="text-hint text-[11px] truncate">{agent.role}</p>
              </div>

              <span className="text-success text-[10px] font-medium shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                任务中
              </span>
            </motion.button>
          ))}
        </div>
      </section>
    </motion.aside>
  );
}

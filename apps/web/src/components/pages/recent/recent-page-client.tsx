"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Clock,
  MessageSquare,
  CheckSquare,
  FolderKanban,
  File,
  Zap,
  ArrowRight,
  Filter,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { formatTime } from "@/lib/date-utils";
import {
  useRecentRecords,
  matchTimeFilter,
  type RecentRecordEnriched,
  type TimeFilter,
  INDUSTRY_OPTIONS,
} from "@/hooks/use-recent-records";
import type { RecentRecordItem } from "@/lib/api-client";

// ============================================================
// 类型定义
// ============================================================

/** 统合类型：与 api-client RecentRecordItem.type 一致 */
type RecentType = RecentRecordItem["type"];

/** 类型 → 图标、色值、标签、背景 */
const TYPE_CONFIG: Record<
  RecentType,
  { icon: typeof MessageSquare; color: string; bg: string; label: string }
> = {
  conversation: {
    icon: MessageSquare,
    color: "text-brand-blue",
    bg: "bg-brand-blue/10",
    label: "对话",
  },
  task: {
    icon: CheckSquare,
    color: "text-success",
    bg: "bg-success/10",
    label: "任务",
  },
  project: {
    icon: FolderKanban,
    color: "text-warning",
    bg: "bg-warning/10",
    label: "项目",
  },
  file: {
    icon: File,
    color: "text-muted-foreground",
    bg: "bg-muted",
    label: "文件",
  },
  upgrade: {
    icon: Zap,
    color: "text-brand",
    bg: "bg-brand/10",
    label: "升级建议",
  },
};

/** 是否是升级建议记录 */
function isUpgradeRecord(r: RecentRecordEnriched): boolean {
  return r.type === "upgrade";
}

/** 获取记录的可导航链接 */
function getRecordHref(record: RecentRecordEnriched): string {
  return record.href || "/new";
}

// ============================================================
// 常量
// ============================================================

const TIME_GROUPS = ["今天", "昨天", "本周", "更早"] as const;

const FILTER_TABS: { key: RecentType | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "conversation", label: "对话" },
  { key: "task", label: "任务" },
  { key: "project", label: "项目" },
  { key: "file", label: "文件" },
  { key: "upgrade", label: "升级建议" },
];

const TIME_FILTERS: { key: TimeFilter; label: string }[] = [
  { key: "all", label: "全部时间" },
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
  { key: "week", label: "本周" },
  { key: "earlier", label: "更早" },
];

// ============================================================
// 组件
// ============================================================

export function RecentPageClient() {
  const [activeFilter, setActiveFilter] = useState<RecentType | "all">("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");

  // TanStack Query：聚合最近记录，staleTime 30s
  const {
    data: apiRecords = [],
    isLoading,
    isError,
  } = useRecentRecords("all", industryFilter !== "all" ? industryFilter : undefined);

  // 客户端侧按类型 + 时间筛选
  const allRecords = useMemo(() => {
    let filtered = apiRecords;

    // 类型筛选
    if (activeFilter !== "all") {
      filtered = filtered.filter((r) => r.type === activeFilter);
    }

    // 时间筛选
    if (timeFilter !== "all") {
      filtered = filtered.filter((r) => matchTimeFilter(r.timeGroup, timeFilter));
    }

    return filtered;
  }, [apiRecords, activeFilter, timeFilter]);

  // 按时间组归组
  const groupedRecords = useMemo(() => {
    return TIME_GROUPS.map((group) => {
      const items = allRecords.filter((r) => r.timeGroup === group);
      items.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      return { group, items };
    }).filter((g) => g.items.length > 0);
  }, [allRecords]);

  return (
    <div className="flex flex-col h-full p-6">
      {/* 页头 */}
      <PageHeader title="最近" description="继续你的工作" />

      {/* 第一行：类型筛选 Tabs */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveFilter(tab.key)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              activeFilter === tab.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 第二行：时间 + 行业筛选器 */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* 时间筛选 */}
        <div className="flex items-center gap-1">
          <Filter className="size-3.5 text-muted-foreground shrink-0" />
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
            className="text-xs bg-transparent border border-border rounded-lg px-2 py-1.5 text-muted-foreground hover:text-foreground focus:outline-none focus:border-primary cursor-pointer appearance-none"
          >
            {TIME_FILTERS.map((tf) => (
              <option key={tf.key} value={tf.key}>
                {tf.label}
              </option>
            ))}
          </select>
        </div>

        {/* 行业筛选 */}
        <div className="flex items-center gap-1">
          <select
            value={industryFilter}
            onChange={(e) => setIndustryFilter(e.target.value)}
            className="text-xs bg-transparent border border-border rounded-lg px-2 py-1.5 text-muted-foreground hover:text-foreground focus:outline-none focus:border-primary cursor-pointer appearance-none"
          >
            {INDUSTRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 加载指示器 */}
        {isLoading && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            加载中…
          </span>
        )}
      </div>

      {/* 记录列表 */}
      <div className="flex-1 overflow-y-auto space-y-6">
        {isLoading && apiRecords.length === 0 ? (
          /* 首次加载中 */
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 text-muted-foreground animate-spin" />
          </div>
        ) : isError ? (
          /* API 错误兜底 */
          <EmptyState
            icon={Clock}
            title="加载失败"
            description="暂时无法获取最近记录，请稍后重试。"
          />
        ) : groupedRecords.length === 0 ? (
          /* 空结果 */
          <EmptyState
            icon={Clock}
            title="暂无最近记录"
            description="您的最近对话、任务、项目、文件或升级建议将显示在这里。"
          />
        ) : (
          groupedRecords.map(({ group, items }) => (
            <section key={group}>
              {/* 分组标题 */}
              <h3 className="text-xs text-muted-foreground/60 font-medium mb-2 px-1 uppercase tracking-wide">
                {group}
              </h3>

              {/* 记录列表 */}
              <div className="space-y-0.5">
                {items.map((record, i) => {
                  const cfg = TYPE_CONFIG[record.type];
                  const Icon = cfg.icon;
                  const isUpgrade = isUpgradeRecord(record);
                  const href = getRecordHref(record);

                  const rowContent = (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.15,
                        delay: i * 0.02,
                        ease: "easeOut",
                      }}
                      className={cn(
                        "relative flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors group",
                        isUpgrade && "border-l-2 border-l-warning pl-[10px]",
                      )}
                    >
                      {/* 类型图标容器（32px 圆形） */}
                      <div
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full",
                          cfg.bg,
                        )}
                      >
                        <Icon className={cn("size-4", cfg.color)} />
                      </div>

                      {/* 中间：标题 + 来源 */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {record.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {record.source}
                          {isUpgrade && record.meta?.proposalId ? (
                            <span className="ml-2 font-mono text-[10px] text-hint">
                              {record.meta.proposalId as string}
                            </span>
                          ) : null}
                        </p>
                      </div>

                      {/* 右侧：时间 + 操作 */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTime(record.timestamp, record.timeGroup)}
                        </span>

                        {isUpgrade ? (
                          <span
                            className={cn(
                              "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium",
                              "bg-warning/10 text-warning",
                              "opacity-0 group-hover:opacity-100 transition-opacity",
                            )}
                          >
                            <span>立即审批</span>
                            <ArrowRight className="size-3" />
                          </span>
                        ) : (
                          <span className="text-xs text-hint opacity-0 group-hover:opacity-100 transition-opacity">
                            查看 →
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );

                  return (
                    <Link
                      key={`${record.type}-${record.id}`}
                      href={href}
                      className="block cursor-pointer"
                    >
                      {rowContent}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

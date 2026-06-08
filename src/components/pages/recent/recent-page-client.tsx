"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Clock,
  MessageSquare,
  CheckSquare,
  FolderKanban,
  File,
  Zap,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useTradeStore } from "@/stores/trade-store";

// ============================================================
// 类型定义
// ============================================================

type RecentType = "conversation" | "task" | "project" | "file" | "upgrade";

interface RecentRecord {
  id: string;
  type: RecentType;
  title: string;
  source: string;
  timeGroup: "今天" | "昨天" | "本周";
  timestamp: string;
  proposalId?: string;
}

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

// ============================================================
// Mock 数据（15 条，覆盖所有类型 + 3 个时间组）
// ============================================================

const MOCK_RECORDS: RecentRecord[] = [
  // ---- 今天 ----
  {
    id: "r-001",
    type: "conversation",
    title: "BrightPath Outdoors 报价确认与 UL 认证更新讨论",
    source: "Gmail · 张伟",
    timeGroup: "今天",
    timestamp: "2026-06-06T10:30:00Z",
  },
  {
    id: "r-002",
    type: "task",
    title: "Sakura 样品第三次质量整改方案制定",
    source: "项目管理 · 王芳",
    timeGroup: "今天",
    timestamp: "2026-06-06T09:45:00Z",
  },
  {
    id: "r-003",
    type: "project",
    title: "德国 Schmidt 精密五金 Q3 价格调整与合同续签",
    source: "项目空间 · 李敏",
    timeGroup: "今天",
    timestamp: "2026-06-06T08:30:00Z",
  },
  {
    id: "r-004",
    type: "file",
    title: "2026 产品目录_v3.pdf",
    source: "Google Drive · Diana 上传",
    timeGroup: "今天",
    timestamp: "2026-06-06T07:50:00Z",
  },
  {
    id: "r-005",
    type: "upgrade",
    title: "询盘分拣置信度阈值微调（假阳性率升至 3.75%）",
    source: "自动触发 · agent-002",
    timeGroup: "今天",
    timestamp: "2026-06-06T06:00:00Z",
    proposalId: "HEP-20260601-001",
  },
  {
    id: "r-006",
    type: "conversation",
    title: "法国 Maison Élégance 高端骨瓷茶具 OEM 询价",
    source: "邮件 · 未分配",
    timeGroup: "今天",
    timestamp: "2026-06-06T05:15:00Z",
  },
  // ---- 昨天 ----
  {
    id: "r-007",
    type: "task",
    title: "广交会春季 200+ 线索按区域分批分配至销售团队",
    source: "任务面板 · 陈强",
    timeGroup: "昨天",
    timestamp: "2026-06-05T16:30:00Z",
  },
  {
    id: "r-008",
    type: "conversation",
    title: "英国 Hackett 百货 PO-2026-0421 订单确认与 UKCA 标识方案",
    source: "Outlook · 刘洋",
    timeGroup: "昨天",
    timestamp: "2026-06-05T14:00:00Z",
  },
  {
    id: "r-009",
    type: "file",
    title: "Q3 市场调研报告_智能家居出海.docx",
    source: "Notion · Athena 生成",
    timeGroup: "昨天",
    timestamp: "2026-06-05T10:20:00Z",
  },
  {
    id: "r-010",
    type: "project",
    title: "智能家居产品线 2026 出海计划阶段复盘",
    source: "项目空间 · 赵磊",
    timeGroup: "昨天",
    timestamp: "2026-06-05T09:00:00Z",
  },
  {
    id: "r-011",
    type: "upgrade",
    title: "WhatsApp 渠道跟进模板适配（回复率降至 51%）",
    source: "自动触发 · agent-003",
    timeGroup: "昨天",
    timestamp: "2026-06-05T08:00:00Z",
    proposalId: "HEP-20260603-002",
  },
  // ---- 本周 ----
  {
    id: "r-012",
    type: "task",
    title: "2026 春季广交会展会线索结构化整理与跟进计划",
    source: "任务面板 · Scout",
    timeGroup: "本周",
    timestamp: "2026-06-04T15:00:00Z",
  },
  {
    id: "r-013",
    type: "conversation",
    title: "阿联酋 Al-Khaleej LED 工矿灯 SASO 认证询盘",
    source: "WhatsApp · 未分配",
    timeGroup: "本周",
    timestamp: "2026-06-04T10:00:00Z",
  },
  {
    id: "r-014",
    type: "project",
    title: "东南亚家居市场代理拓展——越南代理背景调查",
    source: "项目空间 · 李敏",
    timeGroup: "本周",
    timestamp: "2026-06-03T11:30:00Z",
  },
  {
    id: "r-015",
    type: "file",
    title: "竞品价格监控周报_0601-0605.xlsx",
    source: "飞书文档 · Athena 生成",
    timeGroup: "本周",
    timestamp: "2026-06-02T08:00:00Z",
  },
];

// ============================================================
// 常量
// ============================================================

const TIME_GROUPS = ["今天", "昨天", "本周"] as const;

const FILTER_TABS: { key: RecentType | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "conversation", label: "对话" },
  { key: "task", label: "任务" },
  { key: "project", label: "项目" },
  { key: "file", label: "文件" },
  { key: "upgrade", label: "升级建议" },
];

// ============================================================
// 工具函数
// ============================================================

/** 格式化时间显示 */
function formatTime(isoStr: string, timeGroup: string): string {
  const d = new Date(isoStr);
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");

  if (timeGroup === "今天") {
    const now = Date.now();
    const diffMin = Math.floor((now - d.getTime()) / 60000);
    if (diffMin < 1) return "刚刚";
    if (diffMin < 60) return `${diffMin}分钟前`;
    return `${Math.floor(diffMin / 60)}小时前`;
  }

  if (timeGroup === "昨天") {
    return `昨天 ${hours}:${minutes}`;
  }

  // 本周
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const dayLabel = weekdays[d.getDay()];
  return `${dayLabel} ${hours}:${minutes}`;
}

// ============================================================
// 组件
// ============================================================

export function RecentPageClient() {
  const [activeFilter, setActiveFilter] = useState<RecentType | "all">("all");
  const { harnessProposals, loadProposals } = useTradeStore();

  // 挂载时从 API 加载提案
  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  // 动态混入：将 API 中的 pending 提案转为 upgrade 记录，与 mock 数据合并
  const allRecords = useMemo(() => {
    const apiUpgradeRecords: RecentRecord[] = harnessProposals
      .filter((p) => p.status === "pending")
      .map((p) => ({
        id: p.id,
        type: "upgrade" as const,
        title: p.problemStatement,
        source: `${p.triggeredBy === "auto" ? "自动触发" : "手动提交"} · ${p.targetComponent}`,
        timeGroup: "今天" as const,
        timestamp: p.createdAt,
        proposalId: p.proposalId,
      }));

    // mock 中移除旧的硬编码 upgrade 项，用 API 数据替换
    const mockNonUpgrade = MOCK_RECORDS.filter((r) => r.type !== "upgrade");
    return [...mockNonUpgrade, ...apiUpgradeRecords].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [harnessProposals]);

  // 按筛选条件过滤 + 按时间组归组
  const groupedRecords = useMemo(() => {
    const filtered =
      activeFilter === "all"
        ? allRecords
        : allRecords.filter((r) => r.type === activeFilter);

    return TIME_GROUPS.map((group) => {
      const items = filtered.filter((r) => r.timeGroup === group);
      // 组内按时间倒序
      items.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      return { group, items };
    }).filter((g) => g.items.length > 0);
  }, [activeFilter, allRecords]);

  return (
    <div className="flex flex-col h-full p-6">
      {/* 页头 */}
      <PageHeader
        icon={Clock}
        title="最近"
        subtitle="继续你的工作"
      />

      {/* 筛选 Tabs */}
      <div className="flex items-center gap-1 mb-5 overflow-x-auto">
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

      {/* 时间分组列表 */}
      <div className="flex-1 overflow-y-auto space-y-6">
        {groupedRecords.map(({ group, items }) => (
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
                const isUpgrade = record.type === "upgrade";

                return (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.15,
                      delay: i * 0.02,
                      ease: "easeOut",
                    }}
                    className={cn(
                      "relative flex items-center gap-3 p-3 rounded-xl hover:bg-accent cursor-pointer transition-colors group",
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
                        {isUpgrade && record.proposalId ? (
                          <span className="ml-2 font-mono text-[10px] text-hint">
                            {record.proposalId}
                          </span>
                        ) : null}
                      </p>
                    </div>

                    {/* 右侧：时间 + 升级建议操作 */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTime(record.timestamp, record.timeGroup)}
                      </span>

                      {isUpgrade ? (
                        <Link
                          href="/settings?tab=harness"
                          className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium",
                            "bg-warning/10 text-warning hover:bg-warning/20 transition-colors",
                            "opacity-0 group-hover:opacity-100",
                          )}
                        >
                          <span>立即审批</span>
                          <ArrowRight className="size-3" />
                        </Link>
                      ) : null}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

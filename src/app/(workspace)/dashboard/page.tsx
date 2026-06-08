"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useTradeStore } from "@/stores/trade-store";
import { apiClient } from "@/lib/api-client";
import {
  Sparkles,
  Globe,
  RadarIcon,
  AlertTriangle,
  TrendingUp,
  Circle,
  Send,
  RotateCcw,
  Bot,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageTransition } from "@/components/common/PageTransition";
import { SkeletonCard } from "@/components/common/skeleton-card";
import { cn } from "@/lib/utils";
import type { ImpactLevel } from "@/types";

/** 询盘雷达图：recharts 动态导入，减少首屏 JS ~628KB */
const InquiryRadar = dynamic(
  () => import("@/components/pages/dashboard/inquiry-radar"),
  {
    ssr: false,
    loading: () => (
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex h-[220px] items-center justify-center">
          <SkeletonCard variant="card" />
        </div>
      </div>
    ),
  },
);

// ============================================================
// 辅助函数
// ============================================================

/** 固定参考时间（2026-06-06 14:00 UTC），避免 Date.now() 导致的服务端/客户端不一致 */
const REFERENCE_TIME = new Date("2026-06-06T14:00:00Z").getTime();

/** 将 ISO 时间戳转为相对时间文案（纯函数，固定参考时间，服务端/客户端一致） */
function getRelativeTime(isoString: string): string {
  const date = new Date(isoString).getTime();
  const diffMs = REFERENCE_TIME - date;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays}天前`;
  return new Date(isoString).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

/** 将 credibility 0-1 转为星级字符串 */
function credibilityStars(credibility: number): string {
  const full = Math.round(credibility * 5);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

/** impactLevel → Badge variant 与颜色 */
function impactBadge(level: ImpactLevel) {
  switch (level) {
    case "high":
      return { variant: "destructive" as const, label: "高影响" };
    case "mid":
      return { variant: "secondary" as const, label: "中影响" };
    case "low":
      return { variant: "outline" as const, label: "低影响" };
  }
}

/** 询盘优先度 → 颜色类名 */
function priorityColor(priority: string) {
  switch (priority) {
    case "high":
      return "text-danger";
    case "mid":
      return "text-warning";
    case "low":
      return "text-hint";
  }
}

/** 情报类型 → 中文 */
function intelligenceTypeLabel(type: string) {
  const map: Record<string, string> = {
    currency: "汇率",
    tariff: "关税",
    competitor: "竞品",
    market: "市场",
    logistics: "物流",
  };
  return map[type] ?? type;
}

// ============================================================
// Mock 数据：询盘雷达 / 客户预警 / 市场监控
// ============================================================

/** 客户预警 */
interface AlertItem {
  type: "silence" | "unreplied" | "sample";
  typeLabel: string;
  typeIcon: string;
  typeColor: string;
  description: string;
  customerName: string;
  days: number;
}
const mockAlerts: AlertItem[] = [
  // 高价值客户沉默超 7 天
  {
    type: "silence",
    typeLabel: "高价值客户沉默",
    typeIcon: "🔴",
    typeColor: "text-danger",
    description: "连续未回复邮件/消息超 7 天",
    customerName: "BrightPath Outdoors Inc.",
    days: 9,
  },
  {
    type: "silence",
    typeLabel: "高价值客户沉默",
    typeIcon: "🔴",
    typeColor: "text-danger",
    description: "连续未回复邮件/消息超 7 天",
    customerName: "Schmidt Präzisionstechnik GmbH",
    days: 8,
  },
  {
    type: "silence",
    typeLabel: "高价值客户沉默",
    typeIcon: "🔴",
    typeColor: "text-danger",
    description: "连续未回复邮件/消息超 7 天",
    customerName: "Hackett Department Stores Ltd.",
    days: 7,
  },
  // 报价未回复超 3 天
  {
    type: "unreplied",
    typeLabel: "报价未回复",
    typeIcon: "🟡",
    typeColor: "text-warning",
    description: "报价发出后超 3 天无回应",
    customerName: "Maison Élégance SARL",
    days: 4,
  },
  {
    type: "unreplied",
    typeLabel: "报价未回复",
    typeIcon: "🟡",
    typeColor: "text-warning",
    description: "报价发出后超 3 天无回应",
    customerName: "한국리빙 (Korea Living Co.)",
    days: 3,
  },
  // 样品跟进无进展
  {
    type: "sample",
    typeLabel: "样品跟进无进展",
    typeIcon: "🟠",
    typeColor: "text-[#F0A43B]",
    description: "样品发出后客户未确认收到或反馈",
    customerName: "株式会社 Sakura Living",
    days: 5,
  },
];

/** 市场监控 */
interface MarketMonitorItem {
  label: string;
  value: string;
  change?: string;
  changeTone?: "up" | "down" | "neutral";
  status?: string;
  statusColor?: string;
  hint?: string;
}
const mockMarketMonitor: MarketMonitorItem[] = [
  {
    label: "美元/人民币",
    value: "7.23",
    change: "↑ 0.02",
    changeTone: "up",
  },
  {
    label: "欧元/人民币",
    value: "7.89",
    change: "↓ 0.03",
    changeTone: "down",
  },
  {
    label: "深圳 → 洛杉矶",
    value: "海运",
    status: "正常",
    statusColor: "bg-success",
  },
  {
    label: "美国对华关税",
    value: "关注变动",
    status: "近期调整预警",
    statusColor: "bg-warning",
    hint: "LED 产品反补贴调查进行中",
  },
];

// ============================================================
// 子组件
// ============================================================

/** 筛选栏 */
function FilterBar({
  filter,
  onFilterChange,
  onReset,
}: {
  filter: { country: string; category: string; stage: string };
  onFilterChange: (key: string, value: string) => void;
  onReset: () => void;
}) {
  const selectClass =
    "bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-brand cursor-pointer appearance-none min-w-[120px]";

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          className={selectClass}
          value={filter.country}
          onChange={(e) => onFilterChange("country", e.target.value)}
        >
          <option value="">全部国家</option>
          <option value="美国">美国</option>
          <option value="德国">德国</option>
          <option value="日本">日本</option>
          <option value="英国">英国</option>
          <option value="法国">法国</option>
          <option value="巴西">巴西</option>
          <option value="阿联酋">阿联酋</option>
        </select>
      </div>
      <div className="relative">
        <select
          className={selectClass}
          value={filter.category}
          onChange={(e) => onFilterChange("category", e.target.value)}
        >
          <option value="">全部品类</option>
          <option value="户外灯具">户外灯具</option>
          <option value="精密五金">精密五金</option>
          <option value="家居收纳">家居收纳</option>
          <option value="陶瓷餐具">陶瓷餐具</option>
          <option value="智能家居">智能家居</option>
        </select>
      </div>
      <div className="relative">
        <select
          className={selectClass}
          value={filter.stage}
          onChange={(e) => onFilterChange("stage", e.target.value)}
        >
          <option value="">全部阶段</option>
          <option value="询盘">询盘阶段</option>
          <option value="报价">报价阶段</option>
          <option value="样品">样品阶段</option>
          <option value="订单">订单阶段</option>
          <option value="售后">售后阶段</option>
        </select>
      </div>
      <Button variant="ghost" size="xs" onClick={onReset}>
        <RotateCcw className="size-3" />
        重置
      </Button>
    </div>
  );
}

/** AI 晨报卡片 */
function AiBriefingCard() {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex-1">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          {/* 标题行 */}
          <div className="flex items-center gap-2">
            <div className="bg-brand/15 text-brand flex items-center gap-1.5 rounded-lg px-2.5 py-1">
              <Sparkles className="size-3.5" />
              <span className="text-xs font-medium">Hermes 晨报</span>
            </div>
          </div>

          {/* 摘要 */}
          <p className="text-foreground text-sm leading-relaxed">
            今日美元兑人民币汇率突破 7.25，创年内新高，对出口型企业形成短期利好。欧盟对部分中国
            LED 产品启动反补贴调查，涉及户外灯具品类，建议加速现有欧洲订单出货窗口期。Aqara
            宣布 Q3 大规模进入欧洲智能照明市场，智能家居产品线需提前制定差异化竞争策略。
          </p>

          {/* 底部：时间 + 链接 */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-hint text-xs">2026-06-06 08:00 生成</span>
            <Button variant="link" size="xs" className="text-brand-blue">
              查看完整报告 →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 行业动态流卡片 */
function IntelligenceCard({
  intel,
}: {
  intel: import("@/types").MarketIntelligence;
}) {
  const badge = impactBadge(intel.impactLevel);

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      {/* 顶部：来源 + 可信度 + 影响等级 + 时间 */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-hint text-xs bg-accent rounded px-1.5 py-0.5">
          {intelligenceTypeLabel(intel.type)} · {intel.source}
        </span>
        <span className="text-brand text-xs font-medium">
          {credibilityStars(intel.credibility)}
        </span>
        <Badge
          variant={badge.variant}
          className="text-[10px] px-1.5 py-0 h-4"
        >
          {badge.label}
        </Badge>
        <span className="text-hint text-xs ml-auto">
          {getRelativeTime(intel.publishedAt)}
        </span>
      </div>

      {/* 内容 */}
      <h4 className="text-foreground font-medium text-sm mb-1">
        {intel.title}
      </h4>
      <p className="text-muted-foreground text-sm line-clamp-2 mb-3">
        {intel.summary}
      </p>

      {/* 底部：建议操作 + 按钮 */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-brand-blue text-xs flex-1 line-clamp-1">
          💡 {intel.suggestedAction}
        </span>
        <Button variant="ghost" size="xs" className="shrink-0 text-brand-blue">
          <Send className="size-3" />
          派给智能体
        </Button>
      </div>
    </div>
  );
}

/** 客户预警条目 */
function AlertItemRow({ item }: { item: AlertItem }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="text-sm shrink-0">{item.typeIcon}</span>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">{item.description}</p>
          <p className="text-foreground text-sm font-medium truncate">
            {item.customerName}
            <span className={cn("text-xs ml-1.5", item.typeColor)}>
              {item.days}天
            </span>
          </p>
        </div>
      </div>
      <Button variant="ghost" size="xs" className="text-brand-blue shrink-0">
        立即跟进
      </Button>
    </div>
  );
}

/** 市场监控条目 */
function MarketMonitorRow({ item }: { item: MarketMonitorItem }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-muted-foreground text-sm">{item.label}</span>
      <div className="flex items-center gap-2">
        <span className="text-foreground text-sm font-medium">
          {item.value}
        </span>
        {item.change && (
          <span
            className={cn(
              "text-xs font-medium",
              item.changeTone === "up" && "text-success",
              item.changeTone === "down" && "text-danger",
              item.changeTone === "neutral" && "text-hint"
            )}
          >
            {item.change}
          </span>
        )}
        {item.status && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Circle
              className={cn(
                "size-1.5 fill-current",
                item.statusColor
              )}
            />
            {item.status}
          </span>
        )}
        {item.hint && (
          <span className="text-warning text-xs">⚠ {item.hint}</span>
        )}
      </div>
    </div>
  );
}

/** 智能体健康卡片所需的最小 Agent 形状 */
interface AgentHealthItem {
  id: string;
  name: string;
  status: string;
}

/**
 * 数字员工状态卡片
 * —— 从 /api/agents 读取真实智能体，按 running / idle / error 分类计数；
 *    存在 error 状态时列出名字并提供「立即检查」入口（→ /agents）。
 */
function AgentHealthCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard-agents-health"],
    queryFn: () => apiClient.getAgents(),
  });

  const agents = (data?.agents as AgentHealthItem[] | undefined) ?? [];
  const running = agents.filter((a) => a.status === "running");
  const idle = agents.filter((a) => a.status === "idle");
  const errored = agents.filter((a) => a.status === "error");

  return (
    <div className="bg-[#18181B] rounded-xl border border-[#2A2A31] p-4">
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-3">
        <Bot className="size-4 text-brand" />
        <h3 className="text-foreground text-sm font-semibold">数字员工状态</h3>
      </div>

      {isLoading ? (
        <p className="text-hint py-4 text-center text-xs">加载中…</p>
      ) : isError ? (
        <p className="text-danger py-4 text-center text-xs">
          智能体状态加载失败
        </p>
      ) : (
        <>
          {/* 三类计数 */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-success/5 rounded-lg py-2.5">
              <p className="text-success text-xl font-semibold tabular-nums">
                {running.length}
              </p>
              <p className="text-hint mt-0.5 text-[11px]">运行中</p>
            </div>
            <div className="bg-accent/40 rounded-lg py-2.5">
              <p className="text-muted-foreground text-xl font-semibold tabular-nums">
                {idle.length}
              </p>
              <p className="text-hint mt-0.5 text-[11px]">空闲</p>
            </div>
            <div className="bg-danger/5 rounded-lg py-2.5">
              <p className="text-danger text-xl font-semibold tabular-nums">
                {errored.length}
              </p>
              <p className="text-hint mt-0.5 text-[11px]">异常</p>
            </div>
          </div>

          {/* 异常智能体列表 + 立即检查 */}
          {errored.length > 0 && (
            <div className="border-border mt-3 space-y-2 border-t pt-3">
              {errored.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Circle className="text-danger size-1.5 shrink-0 fill-current" />
                    <span className="text-foreground truncate text-xs">
                      {agent.name}
                    </span>
                  </div>
                  <Link
                    href="/agents"
                    className="text-brand-blue hover:bg-brand-blue/10 shrink-0 rounded px-2 py-0.5 text-[11px] font-medium transition-colors"
                  >
                    立即检查
                  </Link>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// 页面主体
// ============================================================

/** 动态大盘：行业情报与经营监测中心（PRD 10.3） */
export default function DashboardPage() {
  const intelligence = useTradeStore((s) => s.intelligence);
  const inquiries = useTradeStore((s) => s.inquiries);

  // 本地筛选状态
  const [filter, setFilter] = useState({
    country: "",
    category: "",
    stage: "",
  });

  const handleFilterChange = (key: string, value: string) => {
    setFilter((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setFilter({ country: "", category: "", stage: "" });
  };

  // 取最新 5 条询盘
  const latestInquiries = useMemo(
    () =>
      [...inquiries]
        .sort(
          (a, b) =>
            new Date(b.receivedAt).getTime() -
            new Date(a.receivedAt).getTime()
        )
        .slice(0, 5),
    [inquiries]
  );

  // 按类型分组预警
  const silenceAlerts = mockAlerts.filter((a) => a.type === "silence");
  const unrepliedAlerts = mockAlerts.filter((a) => a.type === "unreplied");
  const sampleAlerts = mockAlerts.filter((a) => a.type === "sample");

  return (
    <PageTransition>
    <div className="space-y-5 p-6">
      {/* ================================================================ */}
      {/* 顶部区：AI 晨报 + 筛选 */}
      {/* ================================================================ */}
      <div className="flex items-start gap-5">
        <AiBriefingCard />
        <FilterBar
          filter={filter}
          onFilterChange={handleFilterChange}
          onReset={handleReset}
        />
      </div>

      {/* ================================================================ */}
      {/* 四象限主体 */}
      {/* ================================================================ */}
      <div className="grid grid-cols-3 gap-5">
        {/* ========================================================== */}
        {/* 左上大块（col-span-2）：行业动态流 */}
        {/* ========================================================== */}
        <section className="col-span-2 space-y-4">
          {/* 区块标题 */}
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-brand" />
            <h2 className="text-foreground text-base font-semibold">
              行业动态
            </h2>
            <span className="text-hint text-xs">
              {intelligence.length} 条最新情报
            </span>
          </div>

          {/* 动态列表 */}
          <div className="space-y-2">
            {intelligence.map((intel, i) => (
              <div key={intel.id}>
                <IntelligenceCard intel={intel} />
                {i < intelligence.length - 1 && (
                  <Separator className="mt-2" />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================== */}
        {/* 右上小块（col-span-1）：询盘雷达 */}
        {/* ========================================================== */}
        <section className="col-span-1 space-y-4">
          {/* 区块标题 */}
          <div className="flex items-center gap-2">
            <RadarIcon className="size-4 text-brand" />
            <h2 className="text-foreground text-base font-semibold">
              询盘来源
            </h2>
          </div>

          {/* 雷达图卡片 */}
          <div className="bg-card rounded-2xl border border-border p-4">
            <InquiryRadar />
          </div>

          {/* 最新询盘列表 */}
          <div className="bg-card rounded-2xl border border-border p-4">
            <h3 className="text-foreground text-sm font-medium mb-3">
              最新询盘
            </h3>
            <div className="space-y-2">
              {latestInquiries.map((inq) => (
                <div
                  key={inq.id}
                  className="flex items-center gap-2.5 py-1.5"
                >
                  <span className="text-base shrink-0">{inq.countryFlag}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground text-xs">
                        {inq.fromCountry}
                      </span>
                      <span className="text-foreground text-xs font-medium truncate max-w-[120px]">
                        {inq.companyName.length > 16
                          ? inq.companyName.slice(0, 14) + "…"
                          : inq.companyName}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0 h-4 shrink-0",
                      priorityColor(inq.priority)
                    )}
                  >
                    {inq.priority === "high"
                      ? "高优先"
                      : inq.priority === "mid"
                        ? "中优先"
                        : "低优先"}
                  </Badge>
                  <span className="text-hint text-[10px] shrink-0">
                    {getRelativeTime(inq.receivedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================== */}
        {/* 左下中块（col-span-2）：客户预警 */}
        {/* ========================================================== */}
        <section className="col-span-2 space-y-4">
          {/* 区块标题 */}
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" />
            <h2 className="text-foreground text-base font-semibold">
              预警中心
            </h2>
            <span className="text-hint text-xs">
              {mockAlerts.length} 条活跃预警
            </span>
          </div>

          <div className="bg-card rounded-2xl border border-border p-5">
            {/* 🔴 高价值客户沉默 */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">🔴</span>
                <span className="text-foreground text-sm font-medium">
                  高价值客户沉默超 7 天
                </span>
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                  {silenceAlerts.length}条
                </Badge>
              </div>
              {silenceAlerts.map((item, i) => (
                <AlertItemRow key={`${item.type}-${i}`} item={item} />
              ))}
            </div>

            <Separator className="my-2" />

            {/* 🟡 报价未回复 */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">🟡</span>
                <span className="text-foreground text-sm font-medium">
                  报价未回复超 3 天
                </span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  {unrepliedAlerts.length}条
                </Badge>
              </div>
              {unrepliedAlerts.map((item, i) => (
                <AlertItemRow key={`${item.type}-${i}`} item={item} />
              ))}
            </div>

            <Separator className="my-2" />

            {/* 🟠 样品跟进无进展 */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">🟠</span>
                <span className="text-foreground text-sm font-medium">
                  样品跟进无进展
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-warning">
                  {sampleAlerts.length}条
                </Badge>
              </div>
              {sampleAlerts.map((item, i) => (
                <AlertItemRow key={`${item.type}-${i}`} item={item} />
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================== */}
        {/* 右下小块（col-span-1）：市场监控 */}
        {/* ========================================================== */}
        <section className="col-span-1 space-y-4">
          {/* 区块标题 */}
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-brand-blue" />
            <h2 className="text-foreground text-base font-semibold">
              市场监控
            </h2>
          </div>

          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="divide-y divide-border">
              {mockMarketMonitor.map((item, i) => (
                <MarketMonitorRow key={i} item={item} />
              ))}
            </div>
          </div>

          {/* 数字员工状态（真实数据，来自 /api/agents） */}
          <AgentHealthCard />
        </section>
      </div>
    </div>
    </PageTransition>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  Search,
  Mail,
  UserSearch,
  FileText,
  Package,
  Truck,
  MapPin,
  BarChart2,
  RefreshCw,
  Star,
  ChevronRight,
  ArrowUpRight,
  Users,
  MailOpen,
  FileCheck,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/common/section-title";
import { StatusBadge } from "@/components/common/status-badge";
import { RiskBadge } from "@/components/common/risk-badge";
import { useTradeStore } from "@/stores/trade-store";
import { useAgentStore } from "@/stores/agent-store";
import { useConnectorStore } from "@/stores/connector-store";
import { PageTransition } from "@/components/common/PageTransition";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types";
import type { IntelligenceType } from "@/types";

// ============================================================
// KPI 数据（静态演示数据）
// ============================================================
type KpiTone = "success" | "warning" | "muted";

interface KpiItem {
  label: string;
  value: number | string;
  change: number | null;
  changeLabel: string | null;
  tone: KpiTone;
  icon: typeof TrendingUp;
}

const KPI_DATA: KpiItem[] = [
  {
    label: "今日新询盘",
    value: 12,
    change: 3,
    changeLabel: "较昨日",
    tone: "success",
    icon: TrendingUp,
  },
  {
    label: "跟进中客户",
    value: 47,
    change: null,
    changeLabel: null,
    tone: "muted",
    icon: Users,
  },
  {
    label: "待回复邮件",
    value: 8,
    change: null,
    changeLabel: "需尽快处理",
    tone: "warning",
    icon: MailOpen,
  },
  {
    label: "本月报价数",
    value: 23,
    change: null,
    changeLabel: null,
    tone: "muted",
    icon: FileCheck,
  },
  {
    label: "成交转化率",
    value: "18.6%",
    change: 2.3,
    changeLabel: "较上月",
    tone: "success",
    icon: Percent,
  },
];

// ============================================================
// 工作流列表
// ============================================================
interface WorkflowItem {
  title: string;
  description: string;
  icon: typeof Search;
  color: "blue" | "purple" | "green" | "orange";
}

const WORKFLOWS: WorkflowItem[] = [
  {
    title: "询盘分级处理",
    description: "AI 自动识别询盘意图与优先级，过滤虚假询盘，按规则路由至对应销售",
    icon: Search,
    color: "blue",
  },
  {
    title: "生成开发信",
    description: "根据客户画像与产品信息，自动生成多语种个性化开发信，支持 A/B 测试",
    icon: Mail,
    color: "purple",
  },
  {
    title: "客户画像构建",
    description: "从邮件、聊天、交易历史中提取客户特征，构建 360° 客户画像",
    icon: UserSearch,
    color: "green",
  },
  {
    title: "报价单生成",
    description: "基于实时汇率、成本、运费自动计算多币种专业报价单，支持版本管理",
    icon: FileText,
    color: "orange",
  },
  {
    title: "样品跟进管理",
    description: "跟踪打样全流程：从需求确认、生产进度到寄样反馈，自动提醒关键节点",
    icon: Package,
    color: "blue",
  },
  {
    title: "订单推进跟踪",
    description: "监控订单执行状态，预警交期风险，自动同步生产与物流进度至项目空间",
    icon: Truck,
    color: "purple",
  },
  {
    title: "展会线索整理",
    description: "将展会名片、聊天记录、照片等碎片信息结构化，输出可跟进线索清单",
    icon: MapPin,
    color: "green",
  },
  {
    title: "市场情报分析",
    description: "持续采集行业数据、竞品动作、政策变化，自动推送机会洞察与风险预警",
    icon: BarChart2,
    color: "orange",
  },
  {
    title: "邮件自动跟进",
    description: "按客户阶段与行为触发跟进邮件，支持多轮序列与渠道适配，提升回复率",
    icon: RefreshCw,
    color: "blue",
  },
];

/** 工作流颜色 → Tailwind 工具类映射 */
const WORKFLOW_COLOR_MAP = {
  blue: { text: "text-brand-blue", bg: "bg-brand-blue/10" },
  purple: { text: "text-brand", bg: "bg-brand/10" },
  green: { text: "text-success", bg: "bg-success/10" },
  orange: { text: "text-warning", bg: "bg-warning/10" },
} as const;

// ============================================================
// 情报类型 → 标签配置
// ============================================================
const INTEL_TYPE_CONFIG: Record<
  IntelligenceType,
  { label: string; className: string }
> = {
  currency: { label: "汇率", className: "bg-warning/10 text-warning" },
  tariff: { label: "关税", className: "bg-danger/10 text-danger" },
  competitor: { label: "竞品", className: "bg-brand/10 text-brand" },
  market: { label: "市场", className: "bg-success/10 text-success" },
  logistics: { label: "物流", className: "bg-brand-blue/10 text-brand-blue" },
};

// ============================================================
// 工具函数
// ============================================================

/** 格式化相对时间（简单版） */
function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const diff = now - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  return `${months} 个月前`;
}

/** 可信度星级渲染 */
function CredibilityStars({ score }: { score: number }) {
  const stars = Math.round(score * 5);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "size-2.5",
            i < stars ? "fill-warning text-warning" : "text-hint/30",
          )}
        />
      ))}
    </div>
  );
}

// ============================================================
// KPI 卡片组件
// ============================================================
function KpiCard({
  label,
  value,
  change,
  changeLabel,
  tone,
  icon: Icon,
}: KpiItem) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        {change !== null && tone === "success" ? (
          <TrendingUp className="text-success size-3.5" />
        ) : change !== null ? (
          <TrendingDown className="text-warning size-3.5" />
        ) : (
          <Icon className="text-hint size-3.5" />
        )}
      </div>
      <div className="text-foreground mt-2 text-3xl font-bold">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {changeLabel ? (
        <div
          className={cn(
            "mt-1 flex items-center gap-1 text-xs",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "muted" && "text-hint",
          )}
        >
          {change !== null ? (
            <span className="font-medium">
              {change > 0 ? `↑${change}` : `↓${Math.abs(change)}`}
            </span>
          ) : null}
          <span>{changeLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// 工作流卡片组件
// ============================================================
function WorkflowCard({ title, description, icon: Icon, color }: WorkflowItem) {
  const c = WORKFLOW_COLOR_MAP[color];

  return (
    <div className="bg-card group rounded-xl border border-border p-5 transition-all duration-200 hover:-translate-y-[2px] hover:shadow-md">
      {/* 图标容器 */}
      <div
        className={cn(
          "flex size-12 items-center justify-center rounded-xl",
          c.bg,
        )}
      >
        <Icon className={cn("size-5", c.text)} />
      </div>
      {/* 标题 */}
      <h4 className="text-foreground mt-3 text-sm font-medium">{title}</h4>
      {/* 说明 */}
      <p className="text-hint mt-1 line-clamp-2 text-xs leading-relaxed">
        {description}
      </p>
      {/* 操作按钮 */}
      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" size="xs">
          执行
        </Button>
        <ArrowUpRight className="text-hint size-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </div>
  );
}

// ============================================================
// 智能体推荐卡组件
// ============================================================
/** Agent 渐变背景色盘（按名字首字母 hash） */
const AGENT_GRADIENTS = [
  "from-brand to-brand-blue",
  "from-success to-brand-blue",
  "from-warning to-brand",
  "from-brand-blue to-success",
  "from-brand to-warning",
];

function AgentRecommendCard({
  agent,
  index,
}: {
  agent: Agent;
  index: number;
}) {
  const gradient = AGENT_GRADIENTS[index % AGENT_GRADIENTS.length];

  return (
    <div className="bg-card flex w-[200px] shrink-0 flex-col rounded-xl border border-border p-4">
      {/* 头像 */}
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white",
          gradient,
        )}
      >
        {agent.name.charAt(0)}
      </div>
      {/* 名称 + 状态 */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-foreground text-sm font-medium">
          {agent.name}
        </span>
        <StatusBadge status={agent.status} />
      </div>
      {/* 角色描述 */}
      <p className="text-hint mt-1 line-clamp-2 text-xs leading-relaxed">
        {agent.role} · {agent.description}
      </p>
      {/* 操作 */}
      <Button variant="outline" size="xs" className="mt-3 w-full">
        激活
      </Button>
    </div>
  );
}

// ============================================================
// 页面主体
// ============================================================
export default function ForeignTradePage() {
  const intelligence = useTradeStore((s) => s.intelligence);
  const loadIntelligence = useTradeStore((s) => s.loadIntelligence);
  const storeAgents = useAgentStore((s) => s.agents);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const connectors = useConnectorStore((s) => s.connectors);
  const loadConnectors = useConnectorStore((s) => s.loadConnectors);

  // 加载智能体、市场情报、连接器
  useEffect(() => {
    loadAgents();
    loadIntelligence();
    loadConnectors();
  }, [loadAgents, loadIntelligence, loadConnectors]);

  const topIntel = useMemo(() => intelligence.slice(0, 5), [intelligence]);
  const topAgents = useMemo(() => storeAgents.slice(0, 5), [storeAgents]);
  const recommendedConnectors = useMemo(
    () =>
      connectors
        .filter((c) =>
          ["email", "im", "crm"].includes(c.category),
        )
        .slice(0, 5),
    [connectors],
  );

  return (
    <PageTransition>
    <div className="space-y-6 p-6">
      {/* ================================================ */}
      {/*  1. 顶部 KPI 区                                   */}
      {/* ================================================ */}
      <div className="grid grid-cols-5 gap-4">
        {KPI_DATA.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* ================================================ */}
      {/*  2. 工作流网格                                    */}
      {/* ================================================ */}
      <section>
        <SectionTitle
          title="外贸工作流"
          subtitle="覆盖外贸全链路：从询盘到订单、从线索到复购"
        />
        <div className="mt-4 grid grid-cols-3 gap-4">
          {WORKFLOWS.map((wf) => (
            <WorkflowCard key={wf.title} {...wf} />
          ))}
        </div>
      </section>

      {/* ================================================ */}
      {/*  3. 推荐数字员工                                  */}
      {/* ================================================ */}
      <section>
        <SectionTitle
          title="推荐数字员工"
          action={
            <Link
              href="/agents"
              className="text-brand hover:text-brand/80 flex items-center gap-1 text-xs font-medium transition-colors"
            >
              查看全部
              <ChevronRight className="size-3.5" />
            </Link>
          }
        />
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
          {topAgents.map((agent, i) => (
            <AgentRecommendCard key={agent.id} agent={agent} index={i} />
          ))}
        </div>
      </section>

      {/* ================================================ */}
      {/*  4. 两列布局：市场情报 + 连接器推荐                */}
      {/* ================================================ */}
      <div className="grid grid-cols-3 gap-6">
        {/* ---- 左列：外贸市场情报预览（占 2/3） ---- */}
        <section className="col-span-2">
          <SectionTitle
            title="外贸市场情报预览"
            subtitle="行业动态、汇率波动、竞品动作实时监控"
            action={
              <Link
                href="/dashboard"
                className="text-brand hover:text-brand/80 flex items-center gap-1 text-xs font-medium transition-colors"
              >
                查看大盘
                <ChevronRight className="size-3.5" />
              </Link>
            }
          />
          <div className="mt-4 space-y-3">
            {topIntel.map((item) => {
              const typeConfig = INTEL_TYPE_CONFIG[item.type];
              return (
                <div
                  key={item.id}
                  className="bg-card rounded-xl border border-border p-4 transition-colors hover:border-border/80"
                >
                  <div className="flex items-start gap-3">
                    {/* 类型标签 */}
                    <span
                      className={cn(
                        "inline-flex shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium",
                        typeConfig.className,
                      )}
                    >
                      {typeConfig.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      {/* 标题 */}
                      <h4 className="text-foreground text-sm font-medium">
                        {item.title}
                      </h4>
                      {/* 摘要（2 行） */}
                      <p className="text-hint mt-1 line-clamp-2 text-xs leading-relaxed">
                        {item.summary}
                      </p>
                      {/* 元信息行：可信度 + 影响等级 + 时间 + 操作 */}
                      <div className="mt-2 flex items-center gap-3">
                        <CredibilityStars score={item.credibility} />
                        <RiskBadge level={item.impactLevel} />
                        <span className="text-hint text-[11px]">
                          {formatRelativeTime(item.publishedAt)}
                        </span>
                        <div className="flex-1" />
                        <Button variant="ghost" size="xs">
                          派给智能体
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---- 右列：连接器推荐（占 1/3） ---- */}
        <section className="col-span-1">
          <SectionTitle
            title="连接器推荐"
            subtitle="高效连接邮箱、IM、CRM，打通数据孤岛"
            action={
              <Link
                href="/brain/connectors"
                className="text-brand hover:text-brand/80 flex items-center gap-1 text-xs font-medium transition-colors"
              >
                全部
                <ChevronRight className="size-3.5" />
              </Link>
            }
          />
          <div className="mt-4 space-y-2">
            {recommendedConnectors.map((conn) => (
              <div
                key={conn.id}
                className="bg-card flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-border/80"
              >
                {/* emoji 图标 */}
                <span className="text-lg">{conn.iconEmoji}</span>
                {/* 名称 + 状态 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground text-sm font-medium">
                      {conn.name}
                    </span>
                    {/* 状态点 */}
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        conn.status === "connected" && "bg-success",
                        conn.status === "connecting" && "bg-warning",
                        conn.status === "error" && "bg-danger",
                        conn.status === "available" && "bg-hint",
                      )}
                    />
                  </div>
                  <p className="text-hint mt-0.5 truncate text-[11px]">
                    {conn.description}
                  </p>
                </div>
                {/* 连接按钮 */}
                <Button
                  variant={conn.status === "connected" ? "ghost" : "outline"}
                  size="xs"
                >
                  {conn.status === "connected" ? "已连" : "连接"}
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
    </PageTransition>
  );
}

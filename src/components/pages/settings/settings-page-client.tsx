"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Users,
  Cpu,
  FileSearch,
  Plug,
  Palette,
  CreditCard,
  ScrollText,
  Zap,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  ExternalLink,
  UserPlus,
  MoreHorizontal,
  Shield,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Loader2,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge, type StatusBadgeStatus } from "@/components/common/status-badge";
import { RiskBadge } from "@/components/common/risk-badge";
import { AutomationBadge } from "@/components/common/automation-badge";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useTradeStore } from "@/stores/trade-store";
import { apiClient, ConfirmationRequiredError } from "@/lib/api-client";
import type { HarnessProposal, ProposalStatus } from "@/types";
import { automationLevelFromRisk } from "@/types";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

/** 将 ISO 时间格式化为 "YYYY-MM-DD HH:mm"；空值回退占位 */
function formatHarnessTime(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** 将 ProposalStatus 映射为 StatusBadgeStatus（'rolled-back' → 'error'，其余直接透传） */
function toStatusBadgeStatus(status: ProposalStatus): StatusBadgeStatus {
  if (status === "rolled-back") return "error";
  return status as StatusBadgeStatus;
}

// ============================================================
// 类型定义
// ============================================================

type SettingSection =
  | "enterprise"
  | "team"
  | "model-routing"
  | "audit"
  | "connectors"
  | "brand"
  | "billing"
  | "agents-rules"
  | "harness";

interface SettingNavItem {
  key: SettingSection;
  label: string;
  icon: typeof Building2;
  /** 若有 pending 计数，显示橙色圆点数字 */
  pendingCount?: number;
}

// ============================================================
// 静态数据
// ============================================================

/** 团队成员 mock */
const MOCK_MEMBERS = [
  {
    id: "u-001",
    name: "张伟",
    email: "zhangwei@hermesclaw.cn",
    role: "管理员",
    avatar: "张",
  },
  {
    id: "u-002",
    name: "李敏",
    email: "limin@hermesclaw.cn",
    role: "管理员",
    avatar: "李",
  },
  {
    id: "u-003",
    name: "王芳",
    email: "wangfang@hermesclaw.cn",
    role: "成员",
    avatar: "王",
  },
] as const;

/** 模型路由配置 */
const MOCK_MODEL_ROUTES = [
  { key: "chat", label: "对话理解", model: "Claude Sonnet 4.6", desc: "多轮对话、意图识别、询盘分析" },
  { key: "generation", label: "内容生成", model: "Claude Sonnet 4.6", desc: "开发信、产品描述、市场报告撰写" },
  { key: "code", label: "代码执行", model: "Claude Opus 4.8", desc: "复杂推理、数据分析、逻辑编排" },
  { key: "summary", label: "快速摘要", model: "Claude Haiku 4.5", desc: "邮件分类、标签提取、通知摘要" },
] as const;

/** 审计日志条目（来自 /api/audit） */
interface AuditLogRow {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string | null;
  riskLevel: string | null;
  createdAt: string;
}

/** 审计动作 → 中文标签 */
const AUDIT_ACTION_LABEL: Record<string, string> = {
  "approve.proposal": "审批通过",
  "reject.proposal": "审批驳回",
  "delete.proposal": "删除提案",
  "create.agent": "创建智能体",
  "delete.agent": "删除智能体",
  "update.agent.boundary": "变更任务边界",
  "connector.connect": "连接器授权",
  "connector.disconnect": "断开连接器",
  "delete.connector": "删除连接器",
  "create.memory": "写入记忆",
  "delete.memory": "删除记忆",
  "delete.project": "删除项目",
};

/** 目标类型 → 中文 */
const AUDIT_TARGET_LABEL: Record<string, string> = {
  proposal: "提案",
  agent: "智能体",
  connector: "连接器",
  memory: "记忆",
  project: "项目",
};

// ============================================================
// 子组件
// ============================================================

/** 左侧设置导航项 */
function SettingNavItem({
  item,
  active,
  onClick,
}: {
  item: SettingNavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors text-left",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-accent",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.pendingCount != null && item.pendingCount > 0 ? (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-black">
          {item.pendingCount}
        </span>
      ) : null}
    </button>
  );
}

/** 内容区容器 */
function SectionBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {subtitle ? (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

// ============================================================
// Section 内容组件
// ============================================================

/** 企业信息 */
function EnterpriseSection() {
  return (
    <SectionBlock title="企业信息" subtitle="管理你的企业基本资料与品牌信息">
      <div className="bg-card border border-border rounded-2xl p-6 space-y-5 max-w-2xl">
        {/* 企业名称 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">企业名称</label>
          <input
            type="text"
            defaultValue="赫尔墨斯外贸科技有限公司"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-hint focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>

        {/* Logo 上传占位 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">企业 Logo</label>
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-xl bg-accent border border-border text-hint text-xs">
              Logo
            </div>
            <div className="flex-1 border border-dashed border-border rounded-xl p-4 flex items-center justify-center text-sm text-muted-foreground hover:bg-accent/50 cursor-pointer transition-colors">
              点击或拖拽上传 Logo（建议 256×256 PNG）
            </div>
          </div>
        </div>

        {/* 行业 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">行业</label>
          <select
            defaultValue="foreign-trade"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="foreign-trade">外贸 / 跨境电商</option>
            <option value="manufacturing">制造业</option>
            <option value="tech">科技 / SaaS</option>
            <option value="retail">零售</option>
          </select>
        </div>

        {/* 企业规模 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">企业规模</label>
          <select
            defaultValue="20-50"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="1-10">1-10 人</option>
            <option value="10-20">10-20 人</option>
            <option value="20-50">20-50 人</option>
            <option value="50-200">50-200 人</option>
            <option value="200+">200+ 人</option>
          </select>
        </div>

        {/* 主营产品 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">主营产品</label>
          <input
            type="text"
            defaultValue="户外LED灯具、精密五金件、陶瓷餐具、智能家居套件"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-hint focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>

        {/* 保存按钮 */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/80 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </SectionBlock>
  );
}

/** 团队与权限 */
function TeamSection() {
  return (
    <SectionBlock title="团队与权限" subtitle="管理团队成员及其角色与访问权限">
      <div className="bg-card border border-border rounded-2xl max-w-2xl">
        {/* 成员列表 */}
        <div className="divide-y divide-border">
          {MOCK_MEMBERS.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-4 px-5 py-4"
            >
              {/* 头像 */}
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                {member.avatar}
              </div>

              {/* 名字 + 邮箱 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {member.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {member.email}
                </p>
              </div>

              {/* 角色 badge */}
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0",
                  member.role === "管理员"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {member.role === "管理员" ? (
                  <Shield className="size-3 mr-1" />
                ) : (
                  <Users className="size-3 mr-1" />
                )}
                {member.role}
              </span>

              {/* 操作 */}
              <button
                type="button"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </div>
          ))}
        </div>

        {/* 邀请成员 */}
        <div className="border-t border-border px-5 py-4">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <UserPlus className="size-4" />
            邀请成员
          </button>
        </div>
      </div>
    </SectionBlock>
  );
}

/** 模型路由 */
function ModelRoutingSection() {
  return (
    <SectionBlock title="模型路由" subtitle="为不同功能场景分配 AI 模型，平衡性能与成本">
      <div className="bg-card border border-border rounded-2xl max-w-2xl">
        <div className="divide-y divide-border">
          {MOCK_MODEL_ROUTES.map((route) => (
            <div key={route.key} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {route.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {route.desc}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-foreground">
                  {route.key === "code" ? (
                    <ShieldCheck className="size-3 text-brand" />
                  ) : (
                    <Cpu className="size-3 text-muted-foreground" />
                  )}
                  {route.model}
                </span>
                <button
                  type="button"
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionBlock>
  );
}

/** 审计与日志 */
function AuditSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => apiClient.getAuditLogs(100),
  });
  const logs = (data?.logs ?? []) as AuditLogRow[];

  /** 风险等级 → 徽章样式 */
  const riskBadge = (risk: string | null) => {
    if (risk === "high") return "bg-danger/10 text-danger";
    if (risk === "medium") return "bg-warning/10 text-warning";
    return "bg-success/10 text-success";
  };
  const riskLabel = (risk: string | null) =>
    risk === "high" ? "高风险" : risk === "medium" ? "中风险" : "低风险";

  return (
    <SectionBlock title="审计与日志" subtitle="记录所有关键操作，满足合规与溯源需求">
      <div className="bg-card border border-border rounded-2xl overflow-hidden max-w-3xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/50">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">时间</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">操作类型</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">操作对象</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">执行者</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">风险</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-5 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
                    {formatHarnessTime(log.createdAt)}
                  </td>
                  <td className="px-5 py-3 text-xs text-foreground whitespace-nowrap">
                    {AUDIT_ACTION_LABEL[log.action] ?? log.action}
                  </td>
                  <td className="px-5 py-3 text-xs text-foreground max-w-[160px] truncate">
                    {AUDIT_TARGET_LABEL[log.targetType] ?? log.targetType} · {log.targetId}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {log.actor}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        riskBadge(log.riskLevel),
                      )}
                    >
                      {riskLabel(log.riskLevel)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                    {log.detail ?? "—"}
                  </td>
                </tr>
              ))}
              {/* 加载 / 空 / 错误态 */}
              {!isLoading && !error && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    暂无审计记录，关键操作（审批、删除、连接器授权等）发生后将自动记录于此
                  </td>
                </tr>
              ) : null}
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    加载中…
                  </td>
                </tr>
              ) : null}
              {error ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-danger">
                    审计日志加载失败
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </SectionBlock>
  );
}

/** 连接器授权 */
function ConnectorsSection() {
  return (
    <SectionBlock title="连接器授权" subtitle="管理第三方服务连接器的授权状态与权限范围">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-2xl space-y-4">
        {/* 状态概览 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-success/5 border border-success/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-success">13</p>
            <p className="text-xs text-muted-foreground mt-1">已连接</p>
          </div>
          <div className="bg-warning/5 border border-warning/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-warning">2</p>
            <p className="text-xs text-muted-foreground mt-1">待配置</p>
          </div>
          <div className="bg-danger/5 border border-danger/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-danger">1</p>
            <p className="text-xs text-muted-foreground mt-1">异常</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          涵盖邮箱（Gmail/Outlook）、即时通讯（WhatsApp/微信）、CRM
          （HubSpot/Zoho）、ERP、文档、数据平台等 20 个连接器。
        </p>

        <Link
          href="/brain/connectors"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          前往连接器管理
          <ExternalLink className="size-3.5" />
        </Link>
      </div>

      {/* 工具注册表（AGENTS.md 4.3：所有工具须注册，高危须双审批） */}
      <ToolRegistryBlock />
    </SectionBlock>
  );
}

/** 工具注册表条目 */
interface ToolRow {
  id: string;
  name: string;
  description: string;
  category: string;
  scopes: string[];
  riskLevel: string;
  enabled: boolean;
}

/** 工具注册表展示块 */
function ToolRegistryBlock() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["tool-registry"],
    queryFn: () => apiClient.getTools(),
  });
  const tools = (data?.tools ?? []) as ToolRow[];

  const riskBadge = (risk: string) =>
    risk === "high"
      ? "bg-danger/10 text-danger"
      : risk === "medium"
        ? "bg-warning/10 text-warning"
        : "bg-success/10 text-success";
  const riskLabel = (risk: string) =>
    risk === "high" ? "高危·双审批" : risk === "medium" ? "中" : "低";

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden max-w-2xl mt-4">
      <div className="px-5 py-3 border-b border-border bg-accent/50">
        <h3 className="text-sm font-semibold text-foreground">工具注册表</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          受控工具接入：生产调用走短期 Token（≤15min），高危工具须双人审批
        </p>
      </div>
      <div className="divide-y divide-border">
        {tools.map((tool) => (
          <div key={tool.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-foreground">{tool.name}</code>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                    riskBadge(tool.riskLevel),
                  )}
                >
                  {riskLabel(tool.riskLevel)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {tool.description}
              </p>
            </div>
            <span className="text-[10px] text-hint shrink-0">
              {tool.scopes.join(" / ")}
            </span>
          </div>
        ))}
        {!isLoading && !error && tools.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            暂无注册工具（运行 pnpm seed:tools 写入演示数据）
          </div>
        ) : null}
        {isLoading ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">加载中…</div>
        ) : null}
        {error ? (
          <div className="px-5 py-8 text-center text-sm text-danger">工具注册表加载失败</div>
        ) : null}
      </div>
    </div>
  );
}

/** 品牌设置 */
function BrandSection() {
  return (
    <SectionBlock title="品牌设置" subtitle="自定义工作台的主题色调、Logo 与品牌元素">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-2xl space-y-5">
        {/* 品牌主色预览 */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">品牌主色</label>
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-brand ring-2 ring-border" />
            <code className="text-sm text-muted-foreground font-mono">#7C5CFF</code>
            <button
              type="button"
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              更改
            </button>
          </div>
        </div>

        {/* 辅助色 */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">辅助色</label>
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-brand-blue ring-2 ring-border" />
            <code className="text-sm text-muted-foreground font-mono">#4DA3FF</code>
            <button
              type="button"
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              更改
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/80 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </SectionBlock>
  );
}

/** 账单与套餐 */
function BillingSection() {
  return (
    <SectionBlock title="账单与套餐" subtitle="查看当前套餐使用情况与账单历史">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-2xl space-y-5">
        {/* 当前套餐 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">当前套餐</p>
            <p className="text-2xl font-bold text-foreground mt-1">专业版</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ¥1,299/月 · 下个账单日 2026-07-06
            </p>
          </div>
          <button
            type="button"
            className="border border-border text-foreground hover:bg-accent px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            升级套餐
          </button>
        </div>

        {/* 用量概览 */}
        <div className="border-t border-border pt-5 space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">AI 调用次数</span>
              <span className="text-foreground font-medium">8,420 / 10,000</span>
            </div>
            <div className="h-2 bg-accent rounded-full overflow-hidden">
              <div className="h-full w-[84%] bg-primary rounded-full" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">存储空间</span>
              <span className="text-foreground font-medium">12.4 GB / 50 GB</span>
            </div>
            <div className="h-2 bg-accent rounded-full overflow-hidden">
              <div className="h-full w-[25%] bg-success rounded-full" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">智能体席位</span>
              <span className="text-foreground font-medium">10 / 20</span>
            </div>
            <div className="h-2 bg-accent rounded-full overflow-hidden">
              <div className="h-full w-[50%] bg-warning rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </SectionBlock>
  );
}

/** AGENTS 规则 —— 从 /api/agents-md 获取最新内容，用 MarkdownRenderer 渲染 */
function AgentsRulesSection() {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["agents-md"],
    queryFn: () => apiClient.getAgentsMd(),
    staleTime: 5 * 60 * 1000, // 5 分钟缓存（匹配 API revalidate）
  });

  const content = data?.content ?? "";
  // 摘要：前 25 行作为折叠预览
  const lines = content.split("\n");
  const preview = lines.slice(0, 25).join("\n");
  const hasMore = lines.length > 25;

  return (
    <SectionBlock
      title="AGENTS 规则"
      subtitle="最高行为准则——只读参考，修改须经由 Harness 升级审批（HEP）流程。内容直接读取项目根目录 AGENTS.md，始终展示最新版本。"
    >
      <div className="bg-card border border-border rounded-2xl max-w-3xl overflow-hidden">
        <div className="p-6 space-y-4">
          {/* 加载态 */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-3">
                <div className="bg-accent mx-auto size-10 animate-pulse rounded-xl" />
                <p className="text-muted-foreground text-sm">正在加载 AGENTS.md…</p>
              </div>
            </div>
          ) : error ? (
            /* 错误态 */
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="bg-danger/10 flex size-10 items-center justify-center rounded-xl">
                <AlertCircle className="text-danger size-5" />
              </div>
              <p className="text-muted-foreground text-sm">
                AGENTS.md 加载失败，请检查文件是否存在
              </p>
            </div>
          ) : (
            <>
              {/* Markdown 渲染 */}
              <div className="bg-black/40 rounded-lg p-5 max-h-[400px] overflow-y-auto">
                <MarkdownRenderer content={expanded ? content : preview} />
              </div>

              {/* 折叠展开按钮 */}
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  {expanded ? "收起完整文档" : "查看完整文档"}
                  {expanded ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </button>
              ) : null}

              {/* 来源标注 */}
              <p className="text-hint text-xs">
                数据来源：项目根目录 AGENTS.md，通过 /api/agents-md 读取，始终为最新内容。
              </p>
            </>
          )}
        </div>
      </div>
    </SectionBlock>
  );
}


/** Harness 升级审批中心 */
function HarnessSection() {
  const {
    harnessProposals,
    loading,
    error,
    loadProposals,
    approveProposal,
    rejectProposal,
  } = useTradeStore();

  const [historyExpanded, setHistoryExpanded] = useState(false);

  // ---- 评估引擎状态 + 手动触发（服务端状态走 TanStack Query）----
  const queryClient = useQueryClient();
  const [evalNotice, setEvalNotice] = useState<{
    tone: "success" | "info" | "error";
    text: string;
  } | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["harness-status"],
    queryFn: () => apiClient.getHarnessStatus(),
  });

  const evaluateMutation = useMutation({
    mutationFn: () => apiClient.triggerHarnessEvaluate("manual"),
    onSuccess: async (result) => {
      if (result.triggered && result.proposal) {
        setEvalNotice({
          tone: "success",
          text: `已生成升级提案 ${result.proposal.proposalId}（${result.provider} · ${result.model}），失败率 ${(result.metrics.errorRate * 100).toFixed(1)}%`,
        });
      } else {
        setEvalNotice({
          tone: "info",
          text: result.reason ?? "本次评估未触发升级提案，系统指标健康",
        });
      }
      // 触发后刷新提案列表与评估状态（共享 query key，brain 页同步更新）
      await Promise.all([
        loadProposals(),
        queryClient.invalidateQueries({ queryKey: ["harness-status"] }),
      ]);
    },
    onError: (err) => {
      setEvalNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "评估触发失败",
      });
    },
  });

  // 挂载时加载提案
  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  const pendingProposals = (harnessProposals || []).filter((p) => p.status === "pending");
  const historyProposals = (harnessProposals || []).filter(
    (p) => p.status === "approved" || p.status === "rejected",
  );

  // L3 二次确认弹窗的目标提案；L4 / 其他错误提示
  const [confirmTarget, setConfirmTarget] = useState<HarnessProposal | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  // 实际执行批准（confirm 用于 L3 二次确认；失败上抛由此捕获展示）
  const runApprove = async (id: string, confirm: boolean) => {
    setActionError(null);
    try {
      await approveProposal(id, "管理员", confirm);
      // 审批成功后失效 Harness 状态查询，确保 /brain 面板实时联动
      queryClient.invalidateQueries({ queryKey: ["harness-status"] });
      queryClient.invalidateQueries({ queryKey: ["harness-evolution-log"] });
      const target = (harnessProposals || []).find((p) => p.id === id);
      toast.success(
        target ? `提案 ${target.proposalId} 已批准` : "提案已批准",
        { description: "系统将在下次评估时应用此变更" },
      );
    } catch (err) {
      // L3 缺确认（409）→ 弹确认；L4（403）/ 其他 → 错误提示
      if (err instanceof ConfirmationRequiredError) {
        const target = (harnessProposals || []).find((p) => p.id === id) ?? null;
        setConfirmTarget(target);
        return;
      }
      setActionError(err instanceof Error ? err.message : "审批失败");
    }
  };

  // 点击「批准」：按授权等级分流（AGENTS.md §4.7）
  const handleApprove = (proposal: HarnessProposal) => {
    setActionError(null);
    const automationLevel = proposal.proposedChange.automationLevel || automationLevelFromRisk(proposal.proposedChange.riskLevel);
    if (automationLevel === "L4") {
      // L4 绝对禁止自动，审批通道不放行（按钮本应禁用，此处兜底）
      setActionError("L4 操作绝对禁止自动执行，须由人工在源业务系统发起");
      return;
    }
    if (automationLevel === "L3") {
      setConfirmTarget(proposal);
      return;
    }
    void runApprove(proposal.id, false);
  };

  const handleReject = (id: string) => {
    setActionError(null);
    const target = (harnessProposals || []).find((p) => p.id === id);
    rejectProposal(id, "管理员");
    // 拒绝后失效 Harness 状态查询，确保 /brain 面板实时联动
    queryClient.invalidateQueries({ queryKey: ["harness-status"] });
    toast.error(target ? `提案 ${target.proposalId} 已拒绝` : "提案已拒绝", {
      description: "已记录拒绝原因",
    });
  };

  return (
    <SectionBlock
      title="Harness 升级审批中心"
      subtitle="所有 AI 系统的结构性升级，都必须经由人工审批后生效。"
    >
      <div className="max-w-3xl space-y-6">
        {/* 评估引擎状态卡 + 立即触发 */}
        <div className="bg-card border-border rounded-2xl border p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="bg-brand/10 flex size-8 items-center justify-center rounded-lg">
                <Zap className="text-brand size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Harness 自评估引擎
                </p>
                <p className="text-xs text-muted-foreground">
                  每 {status?.intervalHours ?? 72} 小时自动评估一次（AGENTS.md
                  第三章 Level 2）
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEvalNotice(null);
                evaluateMutation.mutate();
              }}
              disabled={evaluateMutation.isPending}
              className="bg-brand text-white hover:bg-brand/90 inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {evaluateMutation.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  评估中…
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  立即触发评估
                </>
              )}
            </button>
          </div>

          {/* 评估结果提示 */}
          {evalNotice ? (
            <div
              className={cn(
                "mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                evalNotice.tone === "success" &&
                  "border-success/30 bg-success/5 text-success",
                evalNotice.tone === "error" &&
                  "border-danger/30 bg-danger/5 text-danger",
                evalNotice.tone === "info" &&
                  "border-brand-blue/30 bg-brand-blue/5 text-brand-blue",
              )}
            >
              {evalNotice.tone === "error" ? (
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span>{evalNotice.text}</span>
            </div>
          ) : null}

          {/* 四项指标 */}
          <div className="grid grid-cols-4 gap-3">
            {[
              {
                label: "最近评估",
                value: statusLoading
                  ? "…"
                  : formatHarnessTime(status?.lastEvaluatedAt, "尚未评估"),
              },
              {
                label: "下次评估",
                value: statusLoading
                  ? "…"
                  : formatHarnessTime(status?.nextEvaluatedAt, "—"),
              },
              {
                label: "待审批",
                value: String(status?.pendingCount ?? 0),
                tone: "warning" as const,
              },
              {
                label: "提案总数",
                value: String(status?.totalProposals ?? 0),
              },
            ].map((tile) => (
              <div
                key={tile.label}
                className="border-border bg-background/40 rounded-xl border p-3"
              >
                <p className="text-muted-foreground text-xs">{tile.label}</p>
                <p
                  className={cn(
                    "mt-1 text-sm font-semibold",
                    tile.tone === "warning"
                      ? "text-warning"
                      : "text-foreground",
                  )}
                >
                  {tile.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 加载中 */}
        {loading && (harnessProposals || []).length === 0 ? (
          <div className="bg-card border-border rounded-2xl border p-8 text-center">
            <div className="bg-accent mx-auto size-10 animate-pulse rounded-xl" />
            <p className="text-muted-foreground mt-3 text-sm">正在加载提案…</p>
          </div>
        ) : error && (harnessProposals || []).length === 0 ? (
          /* 错误 */
          <div className="bg-card border-border rounded-2xl border p-8 text-center">
            <div className="bg-danger/10 mx-auto flex size-12 items-center justify-center rounded-2xl">
              <AlertCircle className="text-danger size-6" />
            </div>
            <p className="text-foreground mt-3 text-sm font-medium">加载失败</p>
            <p className="text-muted-foreground mt-1 text-xs">{error}</p>
            <button
              type="button"
              onClick={loadProposals}
              className="bg-brand hover:bg-brand/90 mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors"
            >
              <RefreshCw className="size-3.5" />
              重新加载
            </button>
          </div>
        ) : null}

        {/* 审批动作错误提示（L4 兜底 / 服务端拒绝） */}
        {actionError ? (
          <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{actionError}</span>
          </div>
        ) : null}

        {/* 待审批提案 */}
        {!(loading && (harnessProposals || []).length === 0) && !(error && (harnessProposals || []).length === 0) && pendingProposals.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <ShieldCheck className="size-8 text-success mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">暂无待审批提案</p>
            <p className="text-xs text-muted-foreground mt-1">
              系统运行正常，所有升级提案已处理完毕
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingProposals.map((proposal) => (
              <motion.div
                key={proposal.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-xl p-5 space-y-3"
              >
                {/* 顶部：ID + 状态 + 风险 + 触发来源 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-muted-foreground">
                    {proposal.proposalId}
                  </span>
                  <StatusBadge status={toStatusBadgeStatus(proposal.status)} />
                  <RiskBadge level={proposal.proposedChange.riskLevel} />
                  <AutomationBadge level={proposal.proposedChange.automationLevel || automationLevelFromRisk(proposal.proposedChange.riskLevel)} />
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      proposal.triggeredBy === "auto"
                        ? "bg-brand-blue/10 text-brand-blue"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {proposal.triggeredBy === "auto" ? "自动触发" : "手动提交"}
                  </span>
                </div>

                {/* 问题描述 */}
                <p className="font-medium text-sm text-foreground">
                  {proposal.problemStatement}
                </p>

                {/* 证据列表 */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">相关证据：</p>
                  <ul className="space-y-0.5">
                    {proposal.evidence.map((e, i) => (
                      <li
                        key={i}
                        className="text-sm text-muted-foreground flex gap-2"
                      >
                        <span className="text-hint shrink-0">•</span>
                        <span>{e}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 变更说明 */}
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">
                    变更说明：
                  </p>
                  <div className="bg-black/20 rounded-lg p-3 text-sm text-muted-foreground">
                    {proposal.proposedChange.description}
                  </div>
                </div>

                {/* 目标组件 */}
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">目标组件：</span>
                  {proposal.proposedChange.targetComponent}
                </p>

                {/* 预期效果 */}
                <p className="text-sm text-success font-medium">
                  <span className="text-muted-foreground">预期效果：</span>
                  {proposal.estimatedImpact}
                </p>

                {/* 底部操作按钮 */}
                <div className="flex items-center gap-3 pt-2 border-t border-border">
                  {(proposal.proposedChange.automationLevel || automationLevelFromRisk(proposal.proposedChange.riskLevel)) === "L4" ? (
                    /* L4：绝对禁止自动，审批通道不放行 → 批准按钮禁用 */
                    <button
                      type="button"
                      disabled
                      title="L4 操作绝对禁止自动执行，须由人工在源业务系统发起"
                      className="inline-flex items-center gap-1.5 bg-muted text-hint px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed"
                    >
                      <Lock className="size-4" />
                      L4 不可自动批准
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleApprove(proposal)}
                      className="inline-flex items-center gap-1.5 bg-success hover:bg-success/80 text-black px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Check className="size-4" />
                      批准
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleReject(proposal.id)}
                    className="inline-flex items-center gap-1.5 border border-border text-muted-foreground hover:text-danger hover:border-danger/30 hover:bg-danger/5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <X className="size-4" />
                    拒绝
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* 历史审批记录 */}
        {historyProposals.length > 0 ? (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setHistoryExpanded(!historyExpanded)}
              className="flex items-center justify-between w-full px-5 py-4 text-sm font-medium text-foreground hover:bg-accent/30 transition-colors"
            >
              <span>
                历史审批记录（{historyProposals.length}）
              </span>
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  historyExpanded && "rotate-180",
                )}
              />
            </button>

            <AnimatePresence>
              {historyExpanded ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="divide-y divide-border border-t border-border">
                    {historyProposals.map((proposal) => (
                      <div key={proposal.id} className="px-5 py-4 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-muted-foreground">
                            {proposal.proposalId}
                          </span>
                          <StatusBadge status={toStatusBadgeStatus(proposal.status)} />
                          <RiskBadge level={proposal.proposedChange.riskLevel} />
                          <AutomationBadge level={proposal.proposedChange.automationLevel || automationLevelFromRisk(proposal.proposedChange.riskLevel)} />
                        </div>
                        <p className="text-sm text-foreground line-clamp-1">
                          {proposal.problemStatement}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>
                            审批人：{proposal.reviewedBy ?? "—"}
                          </span>
                          <span>
                            审批时间：
                            {proposal.reviewedAt
                              ? new Date(proposal.reviewedAt).toLocaleString(
                                  "zh-CN",
                                )
                              : "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}
      </div>

      {/* L3 高风险二次确认弹窗（AGENTS.md §4.7） */}
      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="text-warning size-5" />
              L3 高风险操作确认
            </DialogTitle>
            <DialogDescription>
              此操作为 L3 高风险，确认批准后将立即生效，无法撤销。
              {confirmTarget ? (
                <span className="mt-2 block font-mono text-xs text-muted-foreground">
                  {confirmTarget.proposalId} · {confirmTarget.problemStatement}
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmTarget(null)}
              className="border-border text-muted-foreground hover:bg-accent inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                const target = confirmTarget;
                setConfirmTarget(null);
                if (target) void runApprove(target.id, true);
              }}
              className="bg-warning hover:bg-warning/90 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-black transition-colors"
            >
              <Check className="size-4" />
              确认批准
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionBlock>
  );
}

// ============================================================
// 主组件
// ============================================================

export function SettingsPageClient() {
  const proposals = useTradeStore((s) => s.harnessProposals);
  const pendingCount = proposals.filter((p) => p.status === "pending").length;
  const searchParams = useSearchParams();

  // 从 URL ?tab= 参数读取初始 section，支持 /recent 跳转自动定位到 Harness 审批
  const [activeSection, setActiveSection] = useState<SettingSection>(() => {
    const tab = searchParams.get("tab");
    if (tab === "harness-review" || tab === "harness") return "harness";
    return "enterprise";
  });

  const navItems: SettingNavItem[] = [
    { key: "enterprise", label: "企业信息", icon: Building2 },
    { key: "team", label: "团队与权限", icon: Users },
    { key: "model-routing", label: "模型路由", icon: Cpu },
    { key: "audit", label: "审计与日志", icon: FileSearch },
    { key: "connectors", label: "连接器授权", icon: Plug },
    { key: "brand", label: "品牌设置", icon: Palette },
    { key: "billing", label: "账单与套餐", icon: CreditCard },
    { key: "agents-rules", label: "AGENTS 规则", icon: ScrollText },
    {
      key: "harness",
      label: "Harness 升级审批",
      icon: Zap,
      pendingCount,
    },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case "enterprise":
        return <EnterpriseSection />;
      case "team":
        return <TeamSection />;
      case "model-routing":
        return <ModelRoutingSection />;
      case "audit":
        return <AuditSection />;
      case "connectors":
        return <ConnectorsSection />;
      case "brand":
        return <BrandSection />;
      case "billing":
        return <BillingSection />;
      case "agents-rules":
        return <AgentsRulesSection />;
      case "harness":
        return <HarnessSection />;
      default:
        return <EnterpriseSection />;
    }
  };

  return (
    <div className="flex flex-col h-full p-6">
      {/* 页头 */}
      <PageHeader
        title="设置"
        description="企业信息、团队权限、模型路由、连接器授权与 Harness 升级审批中心"
      />

      {/* 双栏布局 */}
      <div className="flex gap-8 flex-1 min-h-0 mt-2">
        {/* 左侧导航 */}
        <nav className="w-52 shrink-0 space-y-1">
          {navItems.map((item) => (
            <SettingNavItem
              key={item.key}
              item={item}
              active={activeSection === item.key}
              onClick={() => setActiveSection(item.key)}
            />
          ))}
        </nav>

        {/* 右侧内容区 */}
        <motion.div
          key={activeSection}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="flex-1 min-w-0 overflow-y-auto pb-8"
        >
          {renderContent()}
        </motion.div>
      </div>
    </div>
  );
}

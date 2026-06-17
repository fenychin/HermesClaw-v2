"use client";

import { useState } from "react";
import {
  ShieldCheck,
  Clock,
  User,
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProposalStatus } from "@hermesclaw/event-contracts";

/** 移动端审批卡片（UI 展示用，非合约层 HarnessProposal） */
interface MobileApprovalCard {
  id: string;
  title: string;
  description: string;
  status: ProposalStatus;
  proposer: string;
  agentName: string;
  riskLevel: "low" | "medium" | "high";
  submittedAt: string;
  changes: string[];
}

/** 风险等级配置 */
const riskConfig: Record<
  "low" | "medium" | "high",
  { label: string; className: string }
> = {
  low: { label: "低风险", className: "text-success border-success/30 bg-success/10" },
  medium: {
    label: "中风险",
    className: "text-warning border-warning/30 bg-warning/10",
  },
  high: { label: "高风险", className: "text-danger border-danger/30 bg-danger/10" },
};

/** 模拟 L3 审批数据 */
const MOCK_PROPOSALS: MobileApprovalCard[] = [
  {
    id: "prop-001",
    title: "自动升级邮件回复策略 L2→L3",
    description:
      "基于最近 200 封客户邮件数据分析，将邮件自动回复决策权从 L2（建议）提升至 L3（自动执行），置信度 92%",
    status: "pending",
    proposer: "邮件连接器 Agent",
    agentName: "邮件智能助手",
    riskLevel: "medium",
    submittedAt: "2 小时前",
    changes: ["决策权: L2 建议 → L3 自动执行", "新增自动重试策略（最多 2 次）"],
  },
  {
    id: "prop-002",
    title: "新增海关数据实时查询能力",
    description:
      "将海关进出口数据实时查询连接器接入 Agent 工具池，提升询盘质量评估准确度",
    status: "pending",
    proposer: "询盘排序 Agent",
    agentName: "询盘优先级评分引擎",
    riskLevel: "low",
    submittedAt: "5 小时前",
    changes: ["新增 MCP 连接器: 海关数据查询", "询盘评分权重调整: 市场行情 15% → 25%"],
  },
  {
    id: "prop-003",
    title: "升级自动报价 L2→L4（需人工复核）",
    description:
      "基于成本核算技能，将报价自动化从 L2 升级至 L4（自动生成 + 人工最终确认）",
    status: "approved",
    proposer: "成本核算 Agent",
    agentName: "报价引擎",
    riskLevel: "high",
    submittedAt: "1 天前",
    changes: [
      "决策权: L2 建议 → L4 自动生成+人工确认",
      "新增价格上限约束: 毛利率 ≥ 12%",
    ],
  },
];

/** 状态徽标 */
const statusConfig: Record<
  ProposalStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "待审批",
    className: "text-warning bg-warning/10",
  },
  approved: {
    label: "已通过",
    className: "text-success bg-success/10",
  },
  rejected: {
    label: "已驳回",
    className: "text-danger bg-danger/10",
  },
  draft: {
    label: "草稿",
    className: "text-muted-foreground bg-muted/10",
  },
  active: {
    label: "活跃",
    className: "text-primary bg-primary/10",
  },
  canary: {
    label: "灰度",
    className: "text-info bg-info/10",
  },
  deprecated: {
    label: "已废弃",
    className: "text-muted-foreground bg-muted/10",
  },
  "rolled-back": {
    label: "已回滚",
    className: "text-danger bg-danger/10",
  },
};

/**
 * 移动端 L3 审批列表页
 * —— 展示待审批 Harness 动态升级提案，支持快速审批/驳回
 * —— 仅处理决策权 L2→L3 及以上的升级提案
 */
export default function MobileApprovalsPage() {
  const [proposals] = useState<MobileApprovalCard[]>(MOCK_PROPOSALS);
  const [filter, setFilter] = useState<ProposalStatus | "all">("all");

  const filtered =
    filter === "all"
      ? proposals
      : proposals.filter((p) => p.status === filter);

  const pendingCount = proposals.filter((p) => p.status === "pending").length;

  return (
    <div className="flex flex-col gap-4">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-lg font-semibold tracking-tight">
            Harness 审批
          </h1>
          <p className="text-hint text-xs mt-0.5">
            L3 及以上决策权升级提案
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="bg-primary/15 text-primary rounded-full px-3 py-1.5 text-xs font-medium">
            {pendingCount} 项待审
          </div>
        )}
      </div>

      {/* 状态过滤栏 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {(
          [
            { key: "all", label: "全部" },
            { key: "pending", label: "待审批" },
            { key: "approved", label: "已通过" },
            { key: "rejected", label: "已驳回" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium min-h-11 flex items-center",
              "transition-colors touch-manipulation",
              filter === key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {key === "pending" && pendingCount > 0 && (
              <span className="ml-1 bg-primary-foreground/20 rounded-full px-1.5 text-xs">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 提案列表 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldCheck className="size-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground text-sm">暂无此类审批</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((proposal) => {
            const risk = riskConfig[proposal.riskLevel];
            const stat = statusConfig[proposal.status];

            return (
              <button
                key={proposal.id}
                type="button"
                className={cn(
                  "bg-card rounded-2xl p-4 text-left w-full",
                  "border border-border/50 transition-colors",
                  "active:bg-accent touch-manipulation",
                )}
              >
                {/* 头部信息行 */}
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className={cn(
                      "shrink-0 rounded-xl p-2",
                      proposal.riskLevel === "high"
                        ? "bg-danger/10"
                        : proposal.riskLevel === "medium"
                          ? "bg-warning/10"
                          : "bg-success/10",
                    )}
                  >
                    {proposal.riskLevel === "high" ? (
                      <AlertTriangle className="size-5 text-danger" />
                    ) : (
                      <ShieldCheck
                        className={cn(
                          "size-5",
                          proposal.riskLevel === "medium"
                            ? "text-warning"
                            : "text-success",
                        )}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-foreground text-sm font-medium truncate">
                        {proposal.title}
                      </h3>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border",
                          risk.className,
                        )}
                      >
                        {risk.label}
                      </span>
                    </div>
                    <p className="text-hint text-xs line-clamp-2">
                      {proposal.description}
                    </p>
                  </div>

                  <ChevronRight className="size-4 text-muted-foreground/40 shrink-0 mt-1" />
                </div>

                {/* 变更清单 */}
                <div className="bg-accent/50 rounded-xl p-3 mb-3">
                  <p className="text-muted-foreground text-[10px] font-medium mb-1.5 uppercase tracking-wider">
                    变更内容
                  </p>
                  <ul className="space-y-1">
                    {proposal.changes.map((change, idx) => (
                      <li
                        key={idx}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground"
                      >
                        <ArrowUpRight className="size-3 text-primary shrink-0" />
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 底部元信息 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="size-3" />
                      {proposal.proposer}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {proposal.submittedAt}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      stat.className,
                    )}
                  >
                    {stat.label}
                  </span>
                </div>

                {/* 待审批状态下显示快捷操作按钮 */}
                {proposal.status === "pending" && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        // TODO: 驳回逻辑
                      }}
                      className="flex-1 bg-danger/10 text-danger rounded-xl py-2.5 text-xs font-medium min-h-11 flex items-center justify-center active:bg-danger/20 transition-colors touch-manipulation"
                    >
                      驳回
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        // TODO: 通过逻辑
                      }}
                      className="flex-1 bg-success/10 text-success rounded-xl py-2.5 text-xs font-medium min-h-11 flex items-center justify-center active:bg-success/20 transition-colors touch-manipulation"
                    >
                      批准
                    </button>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

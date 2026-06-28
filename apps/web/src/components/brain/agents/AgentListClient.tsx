"use client";

import Link from "next/link";
import {
  Bot,
  AlertTriangle,
  ChevronRight,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/empty-state";
import { AutomationLevelBadge } from "./AutomationLevelBadge";
import { HarnessStatusBadge } from "./HarnessStatusBadge";
import { cn } from "@/lib/utils";
import type { Agent, AgentRiskLevel } from "@/types";

function RiskLevelIndicator({ level }: { level?: AgentRiskLevel }) {
  if (!level) return null;
  const meta: Record<string, { color: string; label: string }> = {
    high: { color: "bg-danger", label: "高风险" },
    medium: { color: "bg-warning", label: "中风险" },
    low: { color: "bg-success", label: "低风险" },
  };
  const m = meta[level] ?? meta.low;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", m.color)} />
      {m.label}
    </span>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const initial = agent.name.charAt(0).toUpperCase();
  const hasHarnessStatus =
    agent.harnessStatus && agent.harnessStatus !== "none";
  const hasCanary = !!agent.activeCanaryId;

  return (
    <Link
      href={`/brain/agents/${agent.id}`}
      className="bg-card border-border hover:border-brand/40 flex items-center gap-4 rounded-xl border p-4 transition-all group"
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
          "bg-accent text-accent-foreground",
        )}
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground truncate text-sm font-medium group-hover:text-brand transition-colors">
            {agent.name}
          </span>
          {agent.source === "builtin" && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md shrink-0">
              官方
            </span>
          )}
          <AutomationLevelBadge level={agent.automationLevel} />
          {hasHarnessStatus && (
            <HarnessStatusBadge
              status={agent.harnessStatus!}
              size="sm"
            />
          )}
        </div>
        <p className="text-muted-foreground truncate text-xs mt-0.5">
          {agent.role}
        </p>
      </div>
      <div className="hidden sm:flex items-center gap-3 text-xs text-hint shrink-0">
        <span>技能 {agent.bindSkills.length}</span>
        <span>·</span>
        <span>
          状态{" "}
          {agent.status === "running"
            ? "运行中"
            : agent.status === "error"
              ? "异常"
              : "空闲"}
        </span>
        {agent.riskLevel && (
          <>
            <span>·</span>
            <RiskLevelIndicator level={agent.riskLevel} />
          </>
        )}
        {hasCanary && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1 text-purple-500">
              <Activity className="size-3" />
              <span>灰度中</span>
            </span>
          </>
        )}
      </div>
      <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}

interface AgentListClientProps {
  initialAgents: Agent[];
  fetchError?: string | null;
}

export function AgentListClient({ initialAgents, fetchError }: AgentListClientProps) {
  return (
    <PageTransition>
      <div className="w-full max-w-4xl mx-auto py-6 px-6 space-y-6">
        <PageHeader
          title="智能体"
          description="管理 HerneClaw 数字员工 —— 查看、配置与监控智能体运行状态"
          breadcrumb={[
            { label: "智慧大脑", href: "/brain/memory" },
            { label: "智能体" },
          ]}
        />

        {fetchError && (
          <div className="border-danger/30 bg-danger/5 flex items-center gap-2 rounded-xl border px-4 py-3">
            <AlertTriangle className="text-danger size-4 shrink-0" />
            <p className="text-danger text-sm">{fetchError}</p>
          </div>
        )}

        {initialAgents.length === 0 && !fetchError ? (
          <EmptyState
            icon={Bot}
            title="暂无智能体"
            description="尚未创建任何智能体，请前往工作区创建第一个智能体。"
          />
        ) : (
          <div className="space-y-2">
            {initialAgents.map((agent) => (
              <AgentRow key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}

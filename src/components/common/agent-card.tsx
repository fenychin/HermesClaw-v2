"use client";

import type { Agent } from "@/types";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

/** 根据 agent.id 选择不同渐变色的头像背景 */
const GRADIENT_PRESETS = [
  "from-brand to-brand-blue",
  "from-brand-blue to-success",
  "from-success to-brand",
  "from-warning to-danger",
  "from-danger to-brand",
  "from-brand to-warning",
  "from-brand-blue to-warning",
  "from-success to-brand-blue",
];

function getGradient(agentId: string): string {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = agentId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENT_PRESETS.length;
  return GRADIENT_PRESETS[index]!;
}

/** 格式化相对时间 */
function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

interface AgentCardProps {
  agent: Agent;
  selected?: boolean;
  onClick?: () => void;
}

/**
 * 智能体卡片
 * —— 用于智能体列表/网格展示，包含头像、名称、状态、统计信息
 */
export function AgentCard({ agent, selected, onClick }: AgentCardProps) {
  const initial = agent.name.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "bg-card w-full rounded-2xl border p-4 text-left transition-all",
        "hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected
          ? "border-brand ring-1 ring-brand/30"
          : "border-border",
      )}
    >
      {/* 上部：头像 + 名称 + role badge + 状态 */}
      <div className="flex items-start gap-3">
        {/* 圆形渐变头像 */}
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white",
            getGradient(agent.id),
          )}
        >
          {initial}
        </div>

        {/* 名称与角色 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-foreground truncate text-sm font-semibold">
              {agent.name}
            </h3>
            <StatusBadge status={agent.status} />
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">{agent.role}</p>
        </div>
      </div>

      {/* 下部：统计数据 */}
      <div className="border-border mt-3 flex items-center justify-between border-t pt-3">
        <span className="text-hint text-xs">
          {agent.bindConnectors.length} 个连接器 · {agent.bindSkills.length} 个技能
        </span>
        <span className="text-hint text-xs">
          {formatTimeAgo(agent.lastActive)}
        </span>
      </div>
    </button>
  );
}

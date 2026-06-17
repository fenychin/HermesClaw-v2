/**
 * 智能体相关共享常量与工具函数
 * —— 供 AgentDetailPanel / agents/[id] 详情页等所有 agent 渲染组件复用
 *    避免 GRADIENT_PRESETS / getGradient / LOG_STATUS_META / formatDate 等在多处重复定义
 */

import type { Agent } from "@/types";

// ============================================================
// 渐变色头像预设与哈希选择
// ============================================================

/** 渐变色预设（用于智能体头像背景） */
export const GRADIENT_PRESETS = [
  "from-brand to-brand-blue",
  "from-brand-blue to-success",
  "from-success to-brand",
  "from-warning to-danger",
  "from-danger to-brand",
  "from-brand to-warning",
  "from-brand-blue to-warning",
  "from-success to-brand-blue",
] as const;

/** 根据 agentId 哈希选择渐变色 */
export function getGradient(agentId: string): string {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = agentId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENT_PRESETS.length;
  return GRADIENT_PRESETS[index]!;
}

// ============================================================
// 来源标签映射
// ============================================================

/** agent.source → 显示标签与样式 */
export const SOURCE_META: Record<
  Agent["source"],
  { label: string; className: string }
> = {
  builtin: { label: "内置", className: "bg-brand-blue/10 text-brand-blue" },
  custom: { label: "自定义", className: "bg-brand/10 text-brand" },
  industry: { label: "行业", className: "bg-success/10 text-success" },
};

// ============================================================
// 运行日志工具
// ============================================================

/** 智能体运行日志条目（来自 /api/agents/[id]/logs） */
export interface AgentRunLog {
  id: string;
  taskName: string;
  status: string;
  duration: string;
  detail: string | null;
  source: string;
  riskLevel: string | null;
  createdAt: string;
}

/** 日志状态颜色映射 */
export const LOG_STATUS_META: Record<string, { label: string; className: string }> = {
  success: { label: "成功", className: "text-success bg-success/10" },
  error: { label: "失败", className: "text-danger bg-danger/10" },
  running: { label: "执行中", className: "text-brand-blue bg-brand-blue/10" },
  timeout: { label: "超时", className: "text-warning bg-warning/10" },
  needs_human: { label: "待人工", className: "text-warning bg-warning/10" },
};

// ============================================================
// 日期格式化
// ============================================================

/** 格式化 ISO 日期为中文可读 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

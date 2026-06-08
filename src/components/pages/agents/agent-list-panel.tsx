"use client";

import { useState, useMemo } from "react";
import { Search, Plus } from "lucide-react";
import { useAgentStore } from "@/stores/agent-store";
import { AgentCard } from "@/components/common/agent-card";
import { cn } from "@/lib/utils";

/** 分类筛选标签配置 */
interface CategoryTab {
  key: string;
  label: string;
  /** 为 true 时按 source 字段筛选，否则按 category 字段筛选 */
  isSource?: boolean;
}

const CATEGORIES: CategoryTab[] = [
  { key: "", label: "全部" },
  { key: "外贸", label: "外贸" },
  { key: "销售", label: "销售" },
  { key: "运营", label: "运营" },
  { key: "风控", label: "风控" },
  { key: "builtin", label: "内置", isSource: true },
  { key: "custom", label: "自定义", isSource: true },
];

interface AgentListPanelProps {
  /** 点击"创建智能体"按钮回调 */
  onCreateClick: () => void;
}

/**
 * 智能体列表面板
 * —— 左侧固定宽度的智能体列表，包含搜索、分类筛选与 AgentCard 列表
 */
export function AgentListPanel({ onCreateClick }: AgentListPanelProps) {
  const [search, setSearch] = useState("");

  const agents = useAgentStore((s) => s.agents);
  const filter = useAgentStore((s) => s.filter);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const setSelectedAgent = useAgentStore((s) => s.setSelectedAgent);
  const setFilter = useAgentStore((s) => s.setFilter);

  /**
   * 按 store 筛选条件过滤（在组件内用 useMemo 计算，避免 selector 中调用 getter
   * 返回新数组引用导致 Zustand 无限重渲染）
   */
  const filteredAgents = useMemo(
    () =>
      agents.filter((agent) => {
        if (filter.category && !agent.category.includes(filter.category))
          return false;
        if (filter.status && agent.status !== filter.status) return false;
        if (filter.source && agent.source !== filter.source) return false;
        return true;
      }),
    [agents, filter],
  );

  /** 在 store 筛选基础上叠加本地搜索（按名称/角色/描述） */
  const displayAgents = useMemo(() => {
    if (!search.trim()) return filteredAgents;
    const keyword = search.toLowerCase();
    return filteredAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(keyword) ||
        a.role.toLowerCase().includes(keyword) ||
        a.description.toLowerCase().includes(keyword),
    );
  }, [filteredAgents, search]);

  return (
    <div className="flex h-full flex-col">
      {/* ======== 搜索输入框 ======== */}
      <div className="p-4 pb-2">
        <div className="relative">
          <Search className="text-hint absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜索智能体..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-border bg-popover text-foreground placeholder:text-hint focus:ring-ring w-full rounded-xl border py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2"
          />
        </div>
      </div>

      {/* ======== 分类标签筛选（横向滚动） ======== */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        {CATEGORIES.map((cat) => {
          const isActive = cat.isSource
            ? filter.source === cat.key
            : filter.category === cat.key;
          return (
            <button
              key={cat.label}
              type="button"
              onClick={() => {
                if (cat.isSource) {
                  setFilter({
                    source: filter.source === cat.key ? "" : cat.key,
                    category: "",
                  });
                } else {
                  setFilter({
                    category: filter.category === cat.key ? "" : cat.key,
                    source: "",
                  });
                }
              }}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "bg-brand text-white"
                  : "bg-accent text-muted-foreground hover:text-foreground",
              )}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* ======== 智能体列表（使用 AgentCard） ======== */}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {displayAgents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            selected={selectedAgentId === agent.id}
            onClick={() => setSelectedAgent(agent.id)}
          />
        ))}
        {displayAgents.length === 0 ? (
          <p className="text-hint py-8 text-center text-sm">未找到匹配的智能体</p>
        ) : null}
      </div>

      {/* ======== 底部固定按钮："+ 创建智能体" ======== */}
      <div className="border-border border-t p-4">
        <button
          type="button"
          onClick={onCreateClick}
          className="bg-brand hover:bg-brand/90 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-white transition-colors"
        >
          <Plus className="size-4" />
          创建智能体
        </button>
      </div>
    </div>
  );
}

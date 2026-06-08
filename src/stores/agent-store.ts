"use client";

import { create } from "zustand";
import type { Agent, AgentStatus } from "@/types";
import { apiClient } from "@/lib/api-client";

/** 智能体筛选条件 */
interface AgentFilter {
  category: string;
  status: string;
  source: string;
}

/**
 * 智能体状态管理
 * —— 管理智能体列表、选中态、筛选与状态更新
 *    数据源从 mock 迁移至 /api/agents
 */
interface AgentState {
  /** 全部智能体列表 */
  agents: Agent[];
  /** 加载中 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 当前选中的智能体 ID */
  selectedAgentId: string | null;
  /** 筛选条件 */
  filter: AgentFilter;
  /** 筛选后的智能体列表（计算 getter） */
  getFilteredAgents: () => Agent[];

  // ---- 操作方法 ----
  /** 从 API 加载智能体列表 */
  loadAgents: () => Promise<void>;
  /** 设置选中智能体 */
  setSelectedAgent: (id: string | null) => void;
  /** 设置筛选条件（支持部分更新） */
  setFilter: (filter: Partial<AgentFilter>) => void;
  /** 更新智能体运行状态（同时调 API） */
  updateAgentStatus: (id: string, status: AgentStatus) => Promise<void>;
  /** 创建智能体（调 API） */
  createAgent: (data: Partial<Agent>) => Promise<void>;
  /** 删除智能体（调 API，confirm=true 跳过二次确认；未确认时抛 ConfirmationRequiredError） */
  deleteAgent: (id: string, confirm?: boolean) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  loading: false,
  error: null,
  selectedAgentId: null,
  filter: {
    category: "",
    status: "",
    source: "",
  },

  getFilteredAgents: () => {
    const { agents, filter } = get();
    return agents.filter((agent) => {
      if (filter.category && !agent.category.includes(filter.category))
        return false;
      if (filter.status && agent.status !== filter.status) return false;
      if (filter.source && agent.source !== filter.source) return false;
      return true;
    });
  },

  loadAgents: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiClient.getAgents();
      set({ agents: data.agents as Agent[], loading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "加载智能体列表失败";
      set({ error: message, loading: false });
    }
  },

  setSelectedAgent: (id) => set({ selectedAgentId: id }),

  setFilter: (partial) =>
    set((state) => ({
      filter: { ...state.filter, ...partial },
    })),

  updateAgentStatus: async (id, status) => {
    // 乐观更新
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === id ? { ...agent, status } : agent,
      ),
    }));
    try {
      await apiClient.updateAgent(id, { status });
    } catch {
      // 失败时重新加载以回滚
      get().loadAgents();
    }
  },

  createAgent: async (data) => {
    try {
      const result = await apiClient.createAgent(data as Record<string, unknown>);
      const newAgent = result.agent as Agent;
      set((state) => ({
        agents: [newAgent, ...state.agents],
        selectedAgentId: newAgent.id,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "创建智能体失败";
      set({ error: message });
      throw err;
    }
  },

  deleteAgent: async (id, confirm = false) => {
    // 高危删除：先请求确认门禁；未确认时不做乐观删除，抛错供 UI 弹确认
    try {
      await apiClient.deleteAgent(id, confirm);
    } catch (err) {
      // 需二次确认 → 原样抛出，由调用方弹确认后以 confirm=true 重试
      throw err;
    }
    // 确认通过、删除成功后再更新本地状态
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
      selectedAgentId:
        state.selectedAgentId === id ? null : state.selectedAgentId,
    }));
  },
}));

"use client";

import { create } from "zustand";

export interface AgentTemplateSummary {
  id: string;
  name: string;
  role: string;
  description: string;
  tags: string[];
}

interface AgentConfigState {
  availableAgents: AgentTemplateSummary[];
  selectedAgentId: string | null;
  loading: boolean;
  error: string | null;
  actions: {
    selectAgent: (agentId: string) => void;
    loadAgents: () => Promise<void>;
  };
}

export const useAgentConfigStore = create<AgentConfigState>((set) => ({
  availableAgents: [],
  selectedAgentId: null,
  loading: false,
  error: null,
  actions: {
    selectAgent: (agentId) => set({ selectedAgentId: agentId }),
    loadAgents: async () => {
      set({ loading: true, error: null });
      try {
        const res = await fetch("/api/agents");
        if (!res.ok) throw new Error("获取智能体模板列表失败");
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "请求返回失败");
        
        const list = (json.data?.agents || []) as any[];
        const mapped: AgentTemplateSummary[] = list.map((a) => {
          let tags: string[] = [];
          try {
            const parsed = JSON.parse(a.bindSkills || "[]");
            tags = Array.isArray(parsed) ? parsed : [];
          } catch {}
          return {
            id: a.id,
            name: a.name,
            role: a.role || "智能助手",
            description: a.description || "",
            tags,
          };
        });
        set({ availableAgents: mapped, loading: false });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "获取智能体列表失败";
        set({ error: msg, loading: false });
      }
    },
  },
}));

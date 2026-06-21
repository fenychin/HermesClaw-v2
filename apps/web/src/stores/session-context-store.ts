"use client";

import { create } from "zustand";
import type { SessionContext } from "@hermesclaw/shared-types";

interface SessionContextState {
  context: SessionContext | null;
  loading: boolean;
  error: string | null;
  actions: {
    initSession: (agentId: string, workspaceId: string) => Promise<void>;
    clearSession: () => void;
  };
}

export const useSessionContextStore = create<SessionContextState>((set) => ({
  context: null,
  loading: false,
  error: null,
  actions: {
    initSession: async (agentId, workspaceId) => {
      set({ loading: true, error: null });
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, workspaceId }),
        });
        if (!res.ok) throw new Error("初始化会话失败");
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "请求返回失败");
        
        const contextData = json.data as SessionContext;
        set({ context: contextData, loading: false });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "创建会话连接失败";
        set({ error: msg, loading: false });
        throw err;
      }
    },
    clearSession: () => set({ context: null, error: null }),
  },
}));

"use client";

import { create } from "zustand";
import type { Connector, ConnectorStatus } from "@/types";
import { apiClient } from "@/lib/api-client";

/**
 * 连接器状态管理
 * —— 管理连接器列表与连接/断开操作，数据源从 mock 迁移至 /api/connectors
 */
interface ConnectorState {
  /** 全部连接器列表 */
  connectors: Connector[];
  /** 加载中 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;

  // ---- 操作方法 ----
  /** 从 API 加载连接器列表 */
  loadConnectors: () => Promise<void>;
  /** 更新连接器状态（连接/断开，调 PATCH） */
  setStatus: (id: string, status: ConnectorStatus) => Promise<void>;
}

export const useConnectorStore = create<ConnectorState>((set, get) => ({
  connectors: [],
  loading: false,
  error: null,

  loadConnectors: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiClient.getConnectors();
      set({ connectors: data.connectors as Connector[], loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载连接器列表失败";
      set({ error: message, loading: false });
    }
  },

  setStatus: async (id, status) => {
    // 乐观更新
    set((state) => ({
      connectors: state.connectors.map((c) =>
        c.id === id ? { ...c, status } : c,
      ),
    }));
    try {
      await apiClient.updateConnector(id, { status });
    } catch {
      // 失败时重新加载以回滚
      get().loadConnectors();
    }
  },
}));

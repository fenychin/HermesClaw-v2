"use client";

import { create } from "zustand";
import type { Memory, MemoryType } from "@/types";
import { apiClient } from "@/lib/api-client";

/**
 * 智慧大脑记忆状态管理
 * —— 管理三级记忆（短/中/长期）的读写与归档/冻结
 *    数据源从 mock 迁移至 /api/memory
 */
interface MemoryState {
  /** 全部记忆列表 */
  memories: Memory[];
  /** 加载中 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 当前激活的记忆层级标签 */
  activeTab: MemoryType;
  /** 短期记忆（computed getter） */
  getShortMemories: () => Memory[];
  /** 中期记忆（computed getter） */
  getMidMemories: () => Memory[];
  /** 长期记忆（computed getter） */
  getLongMemories: () => Memory[];

  // ---- 操作方法 ----
  /** 从 API 加载记忆列表 */
  loadMemories: () => Promise<void>;
  /** 切换激活标签 */
  setActiveTab: (tab: MemoryType) => void;
  /** 归档记忆（调 API 删除，confirm=true 跳过二次确认；未确认抛 ConfirmationRequiredError） */
  archiveMemory: (id: string, confirm?: boolean) => Promise<void>;
  /** 冻结 / 解冻记忆（调 API） */
  freezeMemory: (id: string, frozen: boolean) => Promise<void>;
  /** 新增记忆（调 API） */
  addMemory: (memory: Partial<Memory>) => Promise<void>;
  /** 升级记忆类型（调 API，可直接指定目标类型） */
  upgradeMemory: (id: string, targetType?: MemoryType) => Promise<void>;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  memories: [],
  loading: false,
  error: null,
  activeTab: "short",

  getShortMemories: () => {
    return get().memories.filter((m) => m.type === "short");
  },

  getMidMemories: () => {
    return get().memories.filter((m) => m.type === "mid");
  },

  getLongMemories: () => {
    return get().memories.filter((m) => m.type === "long");
  },

  loadMemories: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiClient.getMemories();
      set({ memories: data.memories as Memory[], loading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "加载记忆列表失败";
      set({ error: message, loading: false });
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  archiveMemory: async (id, confirm = false) => {
    // 高危删除：先过确认门禁；未确认时抛错供 UI 弹确认，不做乐观删除
    await apiClient.deleteMemory(id, confirm);
    // 确认通过、删除成功后再移除本地
    set((state) => ({
      memories: state.memories.filter((m) => m.id !== id),
    }));
  },

  freezeMemory: async (id, frozen) => {
    // 乐观更新
    set((state) => ({
      memories: state.memories.map((m) =>
        m.id === id ? { ...m, frozen } : m,
      ),
    }));
    try {
      await apiClient.updateMemory(id, { frozen });
    } catch {
      get().loadMemories();
    }
  },

  addMemory: async (memory) => {
    try {
      const result = await apiClient.createMemory(
        memory as Record<string, unknown>,
      );
      const created = result.memory as Memory;
      set((state) => ({
        memories: [created, ...state.memories],
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "创建记忆失败";
      set({ error: message });
    }
  },

  upgradeMemory: async (id, targetType) => {
    const memory = get().memories.find((m) => m.id === id);
    if (!memory) return;

    const nextType: MemoryType = targetType ||
      (memory.type === "short" ? "mid" : memory.type === "mid" ? "long" : "long");

    // 乐观更新
    set((state) => ({
      memories: state.memories.map((m) =>
        m.id === id ? { ...m, type: nextType } : m,
      ),
    }));
    try {
      await apiClient.updateMemory(id, { type: nextType });
    } catch {
      get().loadMemories();
    }
  },
}));

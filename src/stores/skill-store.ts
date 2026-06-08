"use client";

import { create } from "zustand";
import type { Skill, SkillSource } from "@/types";
import { apiClient } from "@/lib/api-client";

/**
 * 技能库状态管理
 * —— 管理技能列表，数据源从 mock 迁移至 /api/skills
 */
interface SkillState {
  /** 全部技能列表 */
  skills: Skill[];
  /** 加载中 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;

  // ---- 操作方法 ----
  /** 从 API 加载技能列表 */
  loadSkills: () => Promise<void>;
  /** 按来源过滤技能 */
  getSkillsBySource: (sources: SkillSource[]) => Skill[];
}

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  loading: false,
  error: null,

  loadSkills: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiClient.getSkills();
      set({ skills: data.skills as Skill[], loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载技能列表失败";
      set({ error: message, loading: false });
    }
  },

  getSkillsBySource: (sources) => {
    return get().skills.filter((s) => sources.includes(s.source));
  },
}));

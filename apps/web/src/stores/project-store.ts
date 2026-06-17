"use client";

import { create } from "zustand";
import type { Project, ProjectType } from "@/types";
import { apiClient } from "@/lib/api-client";

/** 项目筛选条件 */
interface ProjectFilter {
  type: string;
  status: string;
}

/**
 * 项目空间状态管理
 * —— 管理项目列表、选中态、搜索与筛选
 *    数据源从 mock 迁移至 /api/projects
 */
interface ProjectState {
  /** 全部项目列表 */
  projects: Project[];
  /** 加载中 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 当前选中的项目 ID */
  selectedProjectId: string | null;
  /** 搜索关键词 */
  searchQuery: string;
  /** 筛选条件 */
  filter: ProjectFilter;
  /** 筛选后的项目列表（计算 getter） */
  getFilteredProjects: () => Project[];

  // ---- 操作方法 ----
  /** 从 API 加载项目列表 */
  loadProjects: () => Promise<void>;
  /** 设置选中项目 */
  setSelectedProject: (id: string | null) => void;
  /** 设置搜索关键词 */
  setSearchQuery: (query: string) => void;
  /** 设置筛选条件（支持部分更新） */
  setFilter: (filter: Partial<ProjectFilter>) => void;
  /** 创建新项目（调 API） */
  createProject: (input: CreateProjectInput) => Promise<void>;
}

/** 新建项目所需字段 */
export interface CreateProjectInput {
  name: string;
  type: ProjectType;
  owner: string;
  relatedClient?: string;
  country?: string;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,
  selectedProjectId: null,
  searchQuery: "",
  filter: {
    type: "",
    status: "",
  },

  getFilteredProjects: () => {
    const { projects, filter, searchQuery } = get();
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((project) => {
      if (filter.type && project.type !== filter.type) return false;
      if (filter.status && project.status !== filter.status) return false;
      if (q) {
        return (
          project.name.toLowerCase().includes(q) ||
          project.owner.toLowerCase().includes(q) ||
          (project.relatedClient ?? "").toLowerCase().includes(q) ||
          (project.country ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  },

  loadProjects: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiClient.getProjects();
      set({ projects: data.projects as Project[], loading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "加载项目列表失败";
      set({ error: message, loading: false });
    }
  },

  setSelectedProject: (id) => set({ selectedProjectId: id }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setFilter: (partial) =>
    set((state) => ({
      filter: { ...state.filter, ...partial },
    })),

  createProject: async (input) => {
    const now = new Date().toISOString();
    // 乐观创建临时 ID
    const tempId = `proj-temp-${Date.now()}`;
    const tempProject: Project = {
      id: tempId,
      name: input.name,
      type: input.type,
      status: "active",
      owner: input.owner,
      relatedClient: input.relatedClient,
      country: input.country,
      productLine: undefined,
      activeAgents: [],
      riskPoints: [],
      nextActions: [],
      createdAt: now,
      updatedAt: now,
      tags: [input.type],
    };
    set((state) => ({
      projects: [tempProject, ...state.projects],
    }));

    try {
      const result = await apiClient.createProject(
        input as unknown as Record<string, unknown>,
      );
      const created = result.project as Project;
      // 替换临时项目
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === tempId ? created : p,
        ),
        selectedProjectId: created.id,
      }));
    } catch (err) {
      // 移除临时项目
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== tempId),
        error: err instanceof Error ? err.message : "创建项目失败",
      }));
    }
  },
}));

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ProjectContext,
  ProjectFile,
  ProjectSkill,
  ProjectConnection,
} from "@/types";

/**
 * 获取特定项目空间的默认初始上下文数据
 * —— 呼应 PRD 10.5 三栏结构之项目指令/文件/技能/连接卡片区默认状态
 */
const getInitialContext = (): ProjectContext => ({
  instruction: {
    content: "作为 HermesClaw，本项目的专属 AI 数字员工，确保所有工作流程严格符合 AGENTS.md 规范。首要任务是优先处理外贸询盘，针对北美市场，自动提取询盘的核心诉求（如产品规格、认证要求、交付期限等）。",
    updatedAt: new Date().toISOString()
  },
  files: [
    { id: "file-1", name: "CLAUDE.md", size: 9366, type: "markdown", uploadedAt: new Date().toISOString() },
    { id: "file-2", name: "AGENTS.md", size: 10313, type: "markdown", uploadedAt: new Date().toISOString() },
    { id: "file-3", name: "prd.md", size: 13336, type: "markdown", uploadedAt: new Date().toISOString() },
  ],
  skills: [
    { id: "skill-1", name: "外贸询盘智能分类", description: "自动区分虚假询盘与真实询盘，并评定意向等级" },
    { id: "skill-2", name: "北美客群开发信跟进", description: "根据询盘背景生成高度契合的跟进邮件" },
  ],
  connections: [
    { id: "conn-1", title: "UL 认证官方查询", url: "https://productiq.ul.com" },
    { id: "conn-2", title: "EU REACH 法规门槛", url: "https://echa.europa.eu" },
  ],
});

/** Store 状态与操作接口定义 */
interface ProjectContextState {
  /** 按 projectId 存储的上下文映射表 */
  contexts: Map<string, ProjectContext>;

  /** 设置系统指令 */
  setInstruction: (projectId: string, content: string) => void;
  /** 添加参考文件 */
  addFile: (projectId: string, file: ProjectFile) => void;
  /** 移除参考文件 */
  removeFile: (projectId: string, fileId: string) => void;
  /** 添加技能 */
  addSkill: (projectId: string, skill: ProjectSkill) => void;
  /** 移除技能 */
  removeSkill: (projectId: string, skillId: string) => void;
  /** 添加外部网站连接 */
  addConnection: (projectId: string, connection: ProjectConnection) => void;
  /** 断开外部网站连接 */
  removeConnection: (projectId: string, connectionId: string) => void;
  /** 获取特定项目的上下文 */
  getProjectContext: (projectId: string) => ProjectContext;
}

interface SerializedMap {
  __type: "Map";
  value: [string, ProjectContext][];
}

export const useProjectContextStore = create<ProjectContextState>()(
  persist(
    (set, get) => ({
      contexts: new Map<string, ProjectContext>(),

      setInstruction: (projectId, content) =>
        set((state) => {
          const nextContexts = new Map(state.contexts);
          const context = nextContexts.get(projectId) || getInitialContext();
          nextContexts.set(projectId, {
            ...context,
            instruction: {
              content,
              updatedAt: new Date().toISOString(),
            },
          });
          return { contexts: nextContexts };
        }),

      addFile: (projectId, file) =>
        set((state) => {
          const nextContexts = new Map(state.contexts);
          const context = nextContexts.get(projectId) || getInitialContext();
          nextContexts.set(projectId, {
            ...context,
            files: [...context.files, file],
          });
          return { contexts: nextContexts };
        }),

      removeFile: (projectId, fileId) =>
        set((state) => {
          const nextContexts = new Map(state.contexts);
          const context = nextContexts.get(projectId) || getInitialContext();
          nextContexts.set(projectId, {
            ...context,
            files: context.files.filter((f) => f.id !== fileId),
          });
          return { contexts: nextContexts };
        }),

      addSkill: (projectId, skill) =>
        set((state) => {
          const nextContexts = new Map(state.contexts);
          const context = nextContexts.get(projectId) || getInitialContext();
          nextContexts.set(projectId, {
            ...context,
            skills: [...context.skills, skill],
          });
          return { contexts: nextContexts };
        }),

      removeSkill: (projectId, skillId) =>
        set((state) => {
          const nextContexts = new Map(state.contexts);
          const context = nextContexts.get(projectId) || getInitialContext();
          nextContexts.set(projectId, {
            ...context,
            skills: context.skills.filter((s) => s.id !== skillId),
          });
          return { contexts: nextContexts };
        }),

      addConnection: (projectId, connection) =>
        set((state) => {
          const nextContexts = new Map(state.contexts);
          const context = nextContexts.get(projectId) || getInitialContext();
          nextContexts.set(projectId, {
            ...context,
            connections: [...context.connections, connection],
          });
          return { contexts: nextContexts };
        }),

      removeConnection: (projectId, connectionId) =>
        set((state) => {
          const nextContexts = new Map(state.contexts);
          const context = nextContexts.get(projectId) || getInitialContext();
          nextContexts.set(projectId, {
            ...context,
            connections: context.connections.filter((c) => c.id !== connectionId),
          });
          return { contexts: nextContexts };
        }),

      getProjectContext: (projectId) => {
        const contexts = get().contexts;
        const context = contexts.get(projectId);
        return context || getInitialContext();
      },
    }),
    {
      name: "hermesclaw-project-context",
      storage: createJSONStorage(() => localStorage, {
        replacer: (_key, value) => {
          // 处理 Map 序列化
          if (value instanceof Map) {
            return {
              __type: "Map",
              value: Array.from(value.entries()),
            };
          }
          return value;
        },
        reviver: (_key, value) => {
          // 反序列化时还原 Map
          const val = value as Partial<SerializedMap> | null;
          if (val && typeof val === "object" && val.__type === "Map" && Array.isArray(val.value)) {
            return new Map(val.value);
          }
          return value;
        },
      }),
    }
  )
);

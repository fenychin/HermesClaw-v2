"use client";

import { create } from "zustand";

/** 通知项 */
export interface Notification {
  id: string;
  type: "info" | "warning" | "success" | "error";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

/** OpenClaw 智能体执行状态快照 */
export interface AgentExecutionState {
  /** 智能体 ID */
  agentId: string
  /** 当前执行状态 */
  status: 'idle' | 'executing' | 'succeeded' | 'failed' | 'cancelled'
  /** 当前正在执行的任务名称 */
  currentTask?: string
  /** 执行进度（0-100），可选 */
  progress?: number
  /** 最近一次事件时间戳 */
  lastEventAt?: string
  /** 最近一次错误信息 */
  lastError?: string
}

/**
 * 全局 UI 状态（纯客户端交互态）
 * —— 约定：Zustand 仅承载 UI / 客户端状态；服务端数据一律交由 TanStack Query 管理。
 */
interface UiState {
  /** 侧边栏是否折叠（桌面端收起状态） */
  sidebarCollapsed: boolean;
  /** 移动端侧边栏 overlay 是否打开 */
  mobileSidebarOpen: boolean;
  /** 智慧大脑二级导航是否展开 */
  brainSubNavOpen: boolean;
  /** 命令面板是否打开 */
  commandPaletteOpen: boolean;
  /** 通知面板是否打开 */
  notificationPanelOpen: boolean;
  /** 当前激活的右侧面板（null 表示关闭） */
  activeRightPanel: string | null;
  /** 通知列表 */
  notifications: Notification[];
  /** 待审批 Harness 提案数量 */
  upgradeProposalCount: number;
  /** 项目空间系统指令是否已保存（用于编辑器保存状态指示） */
  projectSystemPromptSaved: boolean;
  /** OpenClaw 智能体执行状态映射（agentId → 执行快照） */
  agentExecutionStates: Record<string, AgentExecutionState>;

  // ---- 操作方法 ----
  /** 切换侧边栏折叠态 */
  toggleSidebar: () => void;
  /** 显式设置侧边栏折叠态 */
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** 切换移动端侧边栏 overlay */
  toggleMobileSidebar: () => void;
  /** 显式设置移动端侧边栏 overlay */
  setMobileSidebarOpen: (open: boolean) => void;
  /** 切换智慧大脑二级导航 */
  toggleBrainSubNav: () => void;
  /** 显式设置智慧大脑二级导航 */
  setBrainSubNavOpen: (open: boolean) => void;
  /** 打开 / 关闭命令面板 */
  setCommandPaletteOpen: (open: boolean) => void;
  /** 打开 / 关闭通知面板 */
  setNotificationPanelOpen: (open: boolean) => void;
  /** 设置右侧面板 */
  setActiveRightPanel: (panel: string | null) => void;
  /** 添加通知 */
  addNotification: (notification: Omit<Notification, "id" | "read" | "createdAt">) => void;
  /** 标记通知为已读 */
  markNotificationRead: (id: string) => void;
  /** 标记全部通知为已读 */
  markAllNotificationsRead: () => void;
  /** 删除通知 */
  removeNotification: (id: string) => void;
  /** 设置升级提案计数 */
  setUpgradeProposalCount: (count: number) => void;
  /** 设置项目系统指令保存状态 */
  setProjectSystemPromptSaved: (saved: boolean) => void;
  /** 更新指定智能体的执行状态（由 SSE 事件驱动） */
  updateAgentExecutionState: (state: AgentExecutionState) => void;
  /** 清除指定智能体的执行状态 */
  clearAgentExecutionState: (agentId: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  brainSubNavOpen: true,
  commandPaletteOpen: false,
  notificationPanelOpen: false,
  activeRightPanel: null,
  notifications: [],
  upgradeProposalCount: 0,
  projectSystemPromptSaved: false,
  agentExecutionStates: {},

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  toggleMobileSidebar: () =>
    set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

  toggleBrainSubNav: () =>
    set((state) => ({ brainSubNavOpen: !state.brainSubNavOpen })),
  setBrainSubNavOpen: (open) => set({ brainSubNavOpen: open }),

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  setNotificationPanelOpen: (open) => set({ notificationPanelOpen: open }),

  setActiveRightPanel: (panel) => set({ activeRightPanel: panel }),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        {
          ...notification,
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          read: false,
          createdAt: new Date().toISOString(),
        },
        ...state.notifications,
      ],
    })),

  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    })),

  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  setUpgradeProposalCount: (count) => set({ upgradeProposalCount: count }),

  setProjectSystemPromptSaved: (saved) => set({ projectSystemPromptSaved: saved }),

  updateAgentExecutionState: (execState) =>
    set((state) => ({
      agentExecutionStates: {
        ...state.agentExecutionStates,
        [execState.agentId]: {
          ...state.agentExecutionStates[execState.agentId],
          ...execState,
        },
      },
    })),

  clearAgentExecutionState: (agentId) =>
    set((state) => {
      const next = { ...state.agentExecutionStates }
      delete next[agentId]
      return { agentExecutionStates: next }
    }),
}));

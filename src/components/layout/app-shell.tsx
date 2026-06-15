"use client";

import { useEffect, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./TopBar";
import { useAgentStore } from "@/stores/agent-store";
import { useProjectStore } from "@/stores/project-store";
import { useOpenClawStream } from "@/hooks/use-openclaw-stream";

/** 工作台外壳：左侧侧边栏 + 右侧（TopBar + 主内容滚动区） */
export function AppShell({ children }: { children: ReactNode }) {
  // 全局唯一长连接订阅 OpenClaw SSE 事件流，同步状态回 Zustand ui-store，
  // 解决由于多组件独立长连接导致的高频 429 报错及浏览器网络死锁问题。
  useOpenClawStream();

  // 全局预加载智能体和项目数据（供侧边栏、命令框等全局组件使用）
  // —— 用 getState() 读取，避免订阅 store 触发额外渲染；
  //    幂等守卫：已加载过则不重复拉取（外壳重新挂载时复用已有数据）
  //    延迟至空闲时段执行，避免阻塞首屏渲染与路由切换
  useEffect(() => {
    const id = requestIdleCallback(
      () => {
        const agentState = useAgentStore.getState();
        if (agentState.agents.length === 0 && !agentState.loading) {
          agentState.loadAgents();
        }
        const projectState = useProjectStore.getState();
        if (projectState.projects.length === 0 && !projectState.loading) {
          projectState.loadProjects();
        }
      },
      { timeout: 3000 },
    );
    return () => cancelIdleCallback(id);
  }, []);

  return (
    <div className="bg-background flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

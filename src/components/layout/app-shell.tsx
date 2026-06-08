"use client";

import { useEffect, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./TopBar";
import { useAgentStore } from "@/stores/agent-store";
import { useProjectStore } from "@/stores/project-store";

/** 工作台外壳：左侧侧边栏 + 右侧（TopBar + 主内容滚动区） */
export function AppShell({ children }: { children: ReactNode }) {
  // 全局预加载智能体和项目数据（供侧边栏、命令框等全局组件使用）
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  useEffect(() => {
    loadAgents();
    loadProjects();
  }, [loadAgents, loadProjects]);

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

"use client";

import { useEffect, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./TopBar";
import { OpenClawStreamBridge } from "./openclaw-stream-bridge";
import { useAgentStore } from "@/stores/agent-store";
import { useProjectStore } from "@/stores/project-store";
import { useTradeStore } from "@/stores/trade-store";

/** 工作台外壳：左侧侧边栏 + 右侧（TopBar + 主内容滚动区） */
export function AppShell({ children }: { children: ReactNode }) {

  // 全局预加载智能体和项目数据（供侧边栏、命令框等全局组件使用）
  // —— 用 getState() 读取，避免订阅 store 触发额外渲染；
  //    幂等守卫：已加载过则不重复拉取（外壳重新挂载时复用已有数据）
  //    延迟至空闲时段执行，避免阻塞首屏渲染与路由切换
  useEffect(() => {
    /** 共享预热逻辑，由 requestIdleCallback 或降级 setTimeout 调用 */
    function warmup() {
      const agentState = useAgentStore.getState();
      if (agentState.agents.length === 0 && !agentState.loading) {
        agentState.loadAgents();
      }
      const projectState = useProjectStore.getState();
      if (projectState.projects.length === 0 && !projectState.loading) {
        projectState.loadProjects();
      }
      const tradeState = useTradeStore.getState();
      if (tradeState.intelligence.length === 0 && !tradeState.loading) {
        tradeState.loadIntelligence();
      }
    }

    // Safari 不支持 requestIdleCallback，降级为 setTimeout 200ms
    if (typeof requestIdleCallback === "undefined") {
      const t = window.setTimeout(warmup, 200);
      return () => window.clearTimeout(t);
    }

    // 首屏渲染完成后，在浏览器第一个空闲时段立即预热
    // timeout: 1000 确保即使没有空闲时段，1 秒内也强制执行
    const idleId = requestIdleCallback(warmup, { timeout: 1000 });
    return () => cancelIdleCallback(idleId);
  }, []);

  return (
    <div className="bg-background flex h-screen overflow-hidden">
      <OpenClawStreamBridge />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

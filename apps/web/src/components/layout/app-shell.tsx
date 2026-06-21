"use client";

import { useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Sidebar } from "./sidebar";
import { TopBar } from "./TopBar";
import { useAgentStore } from "@/stores/agent-store";
import { useProjectStore } from "@/stores/project-store";
import { useTradeStore } from "@/stores/trade-store";

// PERF: SSE 连接逻辑懒加载 — 从 main-app.js 移除 useOpenClawStream (~5KB)
const OpenClawStreamBridge = dynamic(() => import("./openclaw-stream-bridge").then(m => ({ default: m.OpenClawStreamBridge })), { ssr: false });

/** 工作台外壳：左侧侧边栏 + 右侧（TopBar + 主内容滚动区） */
export function AppShell({ children }: { children: ReactNode }) {

  // ── 分级渲染策略 (R5) ──
  //   L0 (<100ms): 页面内容渲染 — 用户看到的第一个有效帧
  //   L1 (1.5s):  侧边栏 Store 预热 — 错峰加载，不抢占页面数据请求
  //   冷却期 2min，避免路由切换时重复请求
  useEffect(() => {
    const COOLDOWN_MS = 120_000;

    function warmup() {
      const now = Date.now();
      const agentState = useAgentStore.getState();
      if (agentState.agents.length === 0 && !agentState.loading && (now - ((agentState as any)._lastLoadedAt ?? 0)) > COOLDOWN_MS) {
        agentState.loadAgents();
        (agentState as any)._lastLoadedAt = now;
      }
      const projectState = useProjectStore.getState();
      if (projectState.projects.length === 0 && !projectState.loading && (now - ((projectState as any)._lastLoadedAt ?? 0)) > COOLDOWN_MS) {
        projectState.loadProjects();
        (projectState as any)._lastLoadedAt = now;
      }
      const tradeState = useTradeStore.getState();
      if (tradeState.intelligence.length === 0 && !tradeState.loading && (now - ((tradeState as any)._lastLoadedAt ?? 0)) > COOLDOWN_MS) {
        tradeState.loadIntelligence();
        (tradeState as any)._lastLoadedAt = now;
      }
    }

    // L1: 页面渲染完成后 1.5s 再预热侧边栏数据
    const t = window.setTimeout(warmup, 1500);
    return () => window.clearTimeout(t);
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

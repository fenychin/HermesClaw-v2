"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSessionContextStore } from "@/stores/session-context-store";
import { useAgentConfigStore } from "@/stores/agent-config-store";
import { Sparkles, Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentConfigDrawer } from "./AgentConfigDrawer";

export function WorkspaceSidebar() {
  const router = useRouter();
  const context = useSessionContextStore((s) => s.context);
  const initSession = useSessionContextStore((s) => s.actions.initSession);
  const selectedAgentId = useAgentConfigStore((s) => s.selectedAgentId);

  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [initLoading, setInitLoading] = useState(false);

  async function handleNewChat() {
    setInitLoading(true);
    try {
      const agentId = selectedAgentId ?? "default";
      // 每次新建对话都创建新 Session（CLAUDE.md §2.4 前缀缓存保护）
      await initSession(agentId, context?.workspaceId ?? "default");
      router.push("/workspace/chat");
    } catch (err) {
      console.error("Failed to initialize session:", err);
    } finally {
      setInitLoading(false);
    }
  }

  return (
    <aside className="bg-sidebar border-sidebar-border border-r w-[240px] h-full flex flex-col shrink-0 overflow-hidden select-none relative">
      {/* 品牌头部 */}
      <div className="flex h-14 items-center px-4 shrink-0 border-b border-sidebar-border">
        <Link href="/workspace" className="text-foreground font-bold text-sm tracking-wide flex items-center gap-2">
          <Sparkles className="size-4 text-[#6D5EF9]" />
          AI 工作台
        </Link>
      </div>

      {/* 导航部分 */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {/* AI 工作台核心操作 */}
        <div className="space-y-2">
          <Button
            onClick={handleNewChat}
            disabled={initLoading}
            className="w-full bg-[#6D5EF9] hover:bg-[#5B4EE0] text-white h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-sm shadow-[#6D5EF9]/10"
          >
            {initLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            <span>✦ 新建对话</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => setShowAgentPanel(true)}
            className="w-full bg-card hover:bg-accent border-border h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
          >
            <Bot className="size-3.5 text-muted-foreground" />
            <span>⚙ Agent 库</span>
          </Button>
        </div>
      </nav>

      {/* Agent 配置抽屉 */}
      {showAgentPanel && (
        <AgentConfigDrawer
          onClose={() => setShowAgentPanel(false)}
        />
      )}
    </aside>
  );
}

"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/common/PageTransition";
import { CommandBox } from "@/components/pages/new/command-box";
import { QuickCards } from "@/components/pages/new/quick-cards";
import { QuickTaskPanel } from "@/components/pages/new/quick-task-panel";
import { ConversationArea } from "@/components/pages/new/conversation-area";
import { ModelSelector } from "@/components/pages/new/model-selector";
import { SuggestionPanel } from "@/components/pages/new/suggestion-panel";
import { useChat } from "@/hooks/useChat";
import { useAgentStore } from "@/stores/agent-store";
import { useProjectStore } from "@/stores/project-store";
import type { ModelProvider } from "@/types/chat";

/**
 * 新话题页面（超级入口）
 * —— 核心输入区 + AI 流式对话 | 智能建议
 *    对应 PRD 10.2 新话题
 */
export default function NewTopicPage() {
  // ---- 对话状态（useChat hook 管理流式 API 交互）----
  const {
    messages,
    isStreaming,
    streamingContent,
    error,
    sendMessage,
    stopStreaming,
    clearMessages,
  } = useChat();

  // ---- 预加载智能体和项目列表（供 @ 和 # 下拉使用）----
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  useEffect(() => {
    loadAgents();
    loadProjects();
  }, [loadAgents, loadProjects]);

  // ---- 本地 UI 状态 ----
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<ModelProvider>("deepseek");
  const [focusKey, setFocusKey] = useState(0);
  // 由快捷卡片带入的专属 system prompt（外贸专项角色）；发送后清空
  const [pendingSystemPrompt, setPendingSystemPrompt] = useState<
    string | undefined
  >(undefined);

  // ---- 是否有对话消息 ----
  const hasMessages = messages.length > 0;

  // ---- 发送消息（携带专属 system prompt，若有）----
  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim(), pendingSystemPrompt);
    setInput("");
    setPendingSystemPrompt(undefined);
  }, [input, isStreaming, sendMessage, pendingSystemPrompt]);

  // ---- 快捷卡片点击 → 填入输入框并聚焦，记录专属 system prompt ----
  const handleQuickCardSelect = useCallback(
    (prompt: string, systemPrompt?: string) => {
      setInput(prompt);
      setPendingSystemPrompt(systemPrompt);
      setFocusKey((k) => k + 1);
    },
    [],
  );

  // ---- 右侧 @智能体 → 填入输入框 ----
  const handleMentionAgent = (agentName: string) => {
    setInput(
      `${input.trimEnd()}${input.trimEnd() ? " " : ""}@${agentName} `,
    );
    setFocusKey((k) => k + 1);
  };

  // ---- 右侧建议点击 → 填入输入框（清除卡片专属角色，走 Hermes 规划助手）----
  const handleSuggestionSelect = (text: string) => {
    setInput(text);
    setPendingSystemPrompt(undefined);
    setFocusKey((k) => k + 1);
  };

  return (
    <PageTransition>
      <div className="flex h-full gap-0">
        {/* ======== 中栏：核心对话区 ======== */}
        <div className="flex-1 flex flex-col px-8 py-8 overflow-hidden">
          <div className="w-full max-w-2xl mx-auto flex flex-col flex-1 min-h-0 space-y-4">
            {/* 欢迎头部（无消息时显示） */}
            {!hasMessages && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="text-center space-y-1.5 shrink-0"
              >
                <h1 className="text-foreground text-2xl font-semibold tracking-tight">
                  今天想交给数字员工做什么？
                </h1>
                <p className="text-muted-foreground text-sm">
                  一次需求输入，可同时生成对话、任务、项目空间与技能资产
                </p>
              </motion.div>
            )}

            {/* 对话消息区域（有消息时展开） */}
            {hasMessages && (
              <ConversationArea
                messages={messages}
                isStreaming={isStreaming}
                streamingContent={streamingContent}
                onClearMessages={clearMessages}
              />
            )}

            {/* 核心输入区域 */}
            <div className="shrink-0">
              {/* 模型选择器（右上角） */}
              <div className="flex justify-end mb-2">
                <ModelSelector
                  value={provider}
                  onChange={setProvider}
                  disabled={isStreaming}
                />
              </div>

              {/* 核心命令输入框 */}
              <CommandBox
                value={input}
                onChange={setInput}
                onSubmit={handleSend}
                onStop={stopStreaming}
                isStreaming={isStreaming}
                error={error}
                focusKey={focusKey}
              />
            </div>

            {/* 快捷任务卡片（无消息时显示，有消息时隐藏腾出空间） */}
            {!hasMessages && (
              <div className="shrink-0">
                <p className="text-muted-foreground text-xs font-medium mb-3 px-0.5">
                  快捷工作流
                </p>
                <QuickCards onSelect={handleQuickCardSelect} />
              </div>
            )}

            {/* 结构化快捷任务（直连 /api/task，含置信度护栏）。无消息时显示 */}
            {!hasMessages && (
              <div className="shrink-0">
                <p className="text-muted-foreground text-xs font-medium mb-3 px-0.5">
                  结构化快捷任务
                </p>
                <QuickTaskPanel />
              </div>
            )}
          </div>
        </div>

        {/* ======== 右栏：智能建议 ======== */}
        <div className="w-72 shrink-0 border-l border-border px-4 py-5 overflow-hidden">
          <SuggestionPanel
            onMentionAgent={handleMentionAgent}
            onSelectSuggestion={handleSuggestionSelect}
          />
        </div>
      </div>
    </PageTransition>
  );
}

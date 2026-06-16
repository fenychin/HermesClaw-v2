"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/common/PageTransition";
import { CommandBox } from "@/components/pages/new/command-box";
import { QuickCards } from "@/components/pages/new/quick-cards";
import { QuickTaskPanel } from "@/components/pages/new/quick-task-panel";
import { ConversationArea } from "@/components/pages/new/conversation-area";
import { SuggestionPanel } from "@/components/pages/new/suggestion-panel";
import { RecentPanel } from "@/components/pages/new/recent-panel";
import { useChat } from "@/hooks/useChat";
import { useModelPreference } from "@/hooks/use-model-preference";
import { useUiStore } from "@/stores/ui-store";

/**
 * 新话题页面（超级入口）— PRD §10.2
 * —— 简约居中布局：输入框 + 双排快捷入口 | 右侧 AI 建议
 * —— 支持 ?load=conversationId 自动加载历史对话（从 /recent 跳转）
 */
export default function NewTopicPage() {
  return (
    <Suspense fallback={null}>
      <NewTopicPageInner />
    </Suspense>
  );
}

function NewTopicPageInner() {
  const {
    messages,
    isStreaming,
    streamingContent,
    error,
    conversationId,
    sendMessage,
    stopStreaming,
    clearMessages,
    loadConversation,
    currentTrace,
  } = useChat();

  // 从 Zustand ui-store 读取/写入输入态（PRD §10.2 要求）
  const input = useUiStore((s) => s.newTopicInput);
  const setInput = useUiStore((s) => s.setNewTopicInput);
  const pendingSystemPrompt = useUiStore((s) => s.newTopicPendingSystemPrompt);
  const setPendingSystemPrompt = useUiStore((s) => s.setNewTopicPendingSystemPrompt);
  const clearNewTopicInput = useUiStore((s) => s.clearNewTopicInput);
  const storeSetModelId = useUiStore((s) => s.setNewTopicModelId);

  // 模型选择偏好 Hook（localStorage 恢复 + 持久化，同步到 Zustand ui-store）
  const { selectedModelId, handleModelChange, getApiModelId } = useModelPreference(
    storeSetModelId,
  );

  // 从 /recent 点击跳转时通过 ?load=conversationId 自动加载历史对话
  const searchParams = useSearchParams();
  useEffect(() => {
    const loadId = searchParams.get("load");
    if (loadId) {
      loadConversation(loadId);
    }
  }, [searchParams, loadConversation]);

  const hasMessages = messages.length > 0;

  // 快捷任务面板折叠态（仅空态展示）
  const [showQuickTask, setShowQuickTask] = useState(false);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    const apiModelId = getApiModelId();

    // 解析输入中的 @智能体、#项目、/命令
    const agentMentions = input.match(/@(\S+)/g)?.map((m: string) => m.slice(1)) ?? [];
    const projectRefs = input.match(/#(\S+)/g)?.map((m: string) => m.slice(1)) ?? [];
    const slashCommands = input.match(/\/ft-\S+/g) ?? [];

    // 构建增强的 system prompt（合并命令、智能体上下文）
    let enhancedSystemPrompt = pendingSystemPrompt;
    if (slashCommands.length > 0) {
      const cmdContext = `用户触发了以下技能命令: ${slashCommands.join(", ")}。请按对应技能的职责处理请求。`;
      enhancedSystemPrompt = enhancedSystemPrompt
        ? `${enhancedSystemPrompt}\n\n${cmdContext}`
        : cmdContext;
    }
    if (agentMentions.length > 0) {
      const agentCtx = `用户 @提及了以下智能体: ${agentMentions.join(", ")}。请以协作模式与这些智能体配合。`;
      enhancedSystemPrompt = enhancedSystemPrompt
        ? `${enhancedSystemPrompt}\n\n${agentCtx}`
        : agentCtx;
    }
    if (projectRefs.length > 0) {
      const projectCtx = `用户引用了以下项目空间: ${projectRefs.join(", ")}。请将结果关联至对应项目。`;
      enhancedSystemPrompt = enhancedSystemPrompt
        ? `${enhancedSystemPrompt}\n\n${projectCtx}`
        : projectCtx;
    }

    sendMessage(input.trim(), enhancedSystemPrompt, apiModelId);
    clearNewTopicInput();
  }, [input, isStreaming, sendMessage, pendingSystemPrompt, getApiModelId, clearNewTopicInput]);

  const handleQuickActionSelect = useCallback(
    (prompt: string, systemPrompt?: string) => {
      setInput(prompt);
      setPendingSystemPrompt(systemPrompt);
    },
    [setInput, setPendingSystemPrompt],
  );

  const handleSuggestionSelect = useCallback((text: string) => {
    setInput(text);
  }, [setInput]);

  const handleMentionAgent = useCallback(
    (agentName: string) => {
      setInput((prev: string) => {
        const trimmed = prev.trimEnd();
        return trimmed ? `${trimmed} @${agentName} ` : `@${agentName} `;
      });
    },
    [setInput],
  );

  return (
    <PageTransition>
      <div className="h-full flex bg-background">
        {/* 左栏：整个中栏设为可滚动 */}
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto flex flex-col relative">
          {/* 顶部操作栏：有对话时显示新对话按钮 */}
          {hasMessages && (
            <div className="sticky top-0 flex justify-between items-center px-4 md:px-8 py-3 border-b border-border/50 bg-background/95 backdrop-blur z-20 shrink-0">
              <div className="text-sm font-medium text-muted-foreground">当前对话</div>
              <Button onClick={clearMessages} variant="outline" size="sm" className="gap-1.5 rounded-full">
                <Plus className="size-3.5" />
                新对话
              </Button>
            </div>
          )}

          {/* 对话历史 — 移除内部滚动，改为由外层容器滚动 */}
          {hasMessages && (
            <div className="flex-1 px-4 md:px-8 pt-6 pb-2">
              <div className="max-w-2xl mx-auto">
                <ConversationArea
                  messages={messages}
                  isStreaming={isStreaming}
                  streamingContent={streamingContent}
                  currentTrace={currentTrace}
                  conversationId={conversationId}
                  onClearMessages={clearMessages}
                />
              </div>
            </div>
          )}

          {/* 输入框 + 快捷入口 — 使用 sticky 悬浮在底部 */}
          <div
            className={cn(
              "px-4 md:px-8 w-full",
              hasMessages
                ? "sticky bottom-0 shrink-0 pb-6 pt-2 bg-background/95 backdrop-blur z-10"
                : "flex-1 flex flex-col items-center justify-center min-h-full",
            )}
          >
            <div className="w-full max-w-2xl mx-auto">
              <CommandBox
                value={input}
                onChange={setInput}
                onSubmit={handleSend}
                onStop={stopStreaming}
                isStreaming={isStreaming}
                error={error}
                selectedModelId={selectedModelId}
                onModelChange={handleModelChange}
              />
            </div>

            {/* 快捷入口：仅空状态展示，置于输入框下方 */}
            {!hasMessages && (
              <div className="w-full max-w-2xl mx-auto mt-5 space-y-4">
                <QuickCards onSelect={handleQuickActionSelect} />
              </div>
            )}
          </div>
        </div>

        <aside className="w-64 xl:w-72 shrink-0 border-l border-border overflow-y-auto hidden xl:flex flex-col p-3">
          <SuggestionPanel
            onSelectSuggestion={handleSuggestionSelect}
            onMentionAgent={handleMentionAgent}
          />
          {/* 分隔线 */}
          <div className="border-t border-border my-3" />
          <RecentPanel />
        </aside>
      </div>
    </PageTransition>
  );
}

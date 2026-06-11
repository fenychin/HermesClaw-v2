"use client";

import { Suspense, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { PageTransition } from "@/components/common/PageTransition";
import {
  CommandBox,
  SELECTABLE_MODELS,
  DEFAULT_MODEL_ID,
} from "@/components/pages/new/command-box";
import { QuickCards } from "@/components/pages/new/quick-cards";
import { ConversationArea } from "@/components/pages/new/conversation-area";
import { SuggestionPanel } from "@/components/pages/new/suggestion-panel";
import { RecentPanel } from "@/components/pages/new/recent-panel";
import { useChat } from "@/hooks/useChat";
import { useUiStore } from "@/stores/ui-store";

const LS_MODEL_KEY = "hermes-selected-model";

/** 从 localStorage 恢复上次选择的模型 ID，默认 deepseek-v4-pro */
function loadSavedModel(): string {
  try {
    const saved = localStorage.getItem(LS_MODEL_KEY);
    if (saved && SELECTABLE_MODELS.some((m) => m.id === saved && m.available)) {
      return saved;
    }
  } catch { /* localStorage 不可用时忽略 */ }
  return DEFAULT_MODEL_ID;
}

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
    sendMessage,
    stopStreaming,
    clearMessages,
    loadConversation,
  } = useChat();

  // 从 Zustand ui-store 读取/写入输入态（PRD §10.2 要求）
  const input = useUiStore((s) => s.newTopicInput);
  const setInput = useUiStore((s) => s.setNewTopicInput);
  const pendingSystemPrompt = useUiStore((s) => s.newTopicPendingSystemPrompt);
  const setPendingSystemPrompt = useUiStore((s) => s.setNewTopicPendingSystemPrompt);
  const clearNewTopicInput = useUiStore((s) => s.clearNewTopicInput);
  const selectedModelId = useUiStore((s) => s.newTopicModelId);
  const setSelectedModelId = useUiStore((s) => s.setNewTopicModelId);

  // 从 /recent 点击跳转时通过 ?load=conversationId 自动加载历史对话
  const searchParams = useSearchParams();
  useEffect(() => {
    const loadId = searchParams.get("load");
    if (loadId) {
      loadConversation(loadId);
    }
  }, [searchParams, loadConversation]);

  // 挂载后从 localStorage 恢复上次选择的模型（仅客户端，不参与水合比对）
  useEffect(() => {
    const saved = loadSavedModel();
    if (saved !== DEFAULT_MODEL_ID) {
      setSelectedModelId(saved);
    }
  }, [setSelectedModelId]);

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    try { localStorage.setItem(LS_MODEL_KEY, modelId); } catch { /* noop */ }
  }, [setSelectedModelId]);

  const hasMessages = messages.length > 0;

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    const model = SELECTABLE_MODELS.find((m) => m.id === selectedModelId);
    const apiModelId = model?.modelId;

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
  }, [input, isStreaming, sendMessage, pendingSystemPrompt, selectedModelId, clearNewTopicInput]);

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
        {/* 左栏：输入框始终垂直居中；上方显示对话历史（max-h 限制，不挤走输入框）或快捷入口 */}
        <div className="flex-1 flex flex-col items-center justify-center min-w-0 min-h-0 gap-5 px-4 md:px-8">
          {/* 对话历史（仅当有消息时，限制高度不影响输入框居中） */}
          {hasMessages && (
            <div className="w-full max-w-2xl max-h-[30vh] shrink-0">
              <ConversationArea
                messages={messages}
                isStreaming={isStreaming}
                streamingContent={streamingContent}
                onClearMessages={clearMessages}
              />
            </div>
          )}

          {/* 输入框 — 始终居中 */}
          <div className="w-full max-w-2xl shrink-0">
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

          {/* 快捷入口：双排网格（仅空状态展示） */}
          {!hasMessages && (
            <div className="w-full max-w-2xl">
              <QuickCards onSelect={handleQuickActionSelect} />
            </div>
          )}
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

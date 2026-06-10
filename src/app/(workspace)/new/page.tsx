"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
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
import { useChat } from "@/hooks/useChat";

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
 * —— 两栏布局：对话与输入 | AI 建议与工作流
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

  // 从 /recent 点击跳转时通过 ?load=conversationId 自动加载历史对话
  const searchParams = useSearchParams();
  useEffect(() => {
    const loadId = searchParams.get("load");
    if (loadId) {
      loadConversation(loadId);
    }
  }, [searchParams, loadConversation]);

  const [input, setInput] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string>(loadSavedModel);
  const [pendingSystemPrompt, setPendingSystemPrompt] = useState<string | undefined>(undefined);

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    try { localStorage.setItem(LS_MODEL_KEY, modelId); } catch { /* noop */ }
  }, []);

  const hasMessages = messages.length > 0;

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    const model = SELECTABLE_MODELS.find((m) => m.id === selectedModelId);
    const apiModelId = model?.modelId;
    sendMessage(input.trim(), pendingSystemPrompt, apiModelId);
    setInput("");
    setPendingSystemPrompt(undefined);
  }, [input, isStreaming, sendMessage, pendingSystemPrompt, selectedModelId]);

  const handleQuickActionSelect = useCallback(
    (prompt: string, systemPrompt?: string) => {
      setInput(prompt);
      setPendingSystemPrompt(systemPrompt);
    },
    [],
  );

  const handleSuggestionSelect = useCallback((text: string) => {
    setInput(text);
  }, []);

  const handleMentionAgent = useCallback(
    (agentName: string) => {
      setInput((prev) => {
        const trimmed = prev.trimEnd();
        return trimmed ? `${trimmed} @${agentName} ` : `@${agentName} `;
      });
    },
    [],
  );

  return (
    <PageTransition>
      <div className="h-full flex bg-background">
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {!hasMessages ? (
            <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8">
              <div className="w-full max-w-2xl">
                <CommandBox
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSend}
                  isStreaming={isStreaming}
                  error={error}
                  selectedModelId={selectedModelId}
                  onModelChange={handleModelChange}
                />
              </div>
              <div className="w-full max-w-2xl mt-5">
                <QuickCards onSelect={handleQuickActionSelect} />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 px-4 md:px-8">
              <ConversationArea
                messages={messages}
                isStreaming={isStreaming}
                streamingContent={streamingContent}
                onClearMessages={clearMessages}
              />
              <div className="shrink-0 pb-4 max-w-2xl mx-auto w-full">
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
            </div>
          )}
        </div>

        <aside className="w-64 xl:w-72 shrink-0 border-l border-border overflow-y-auto hidden xl:flex flex-col p-3">
          <SuggestionPanel
            onSelectSuggestion={handleSuggestionSelect}
            onMentionAgent={handleMentionAgent}
          />
        </aside>
      </div>
    </PageTransition>
  );
}

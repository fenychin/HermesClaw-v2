"use client";

import { Suspense, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  CommandBox,
  SELECTABLE_MODELS,
  DEFAULT_MODEL_ID,
} from "@/components/pages/new/command-box";
import { ConversationArea } from "@/components/pages/new/conversation-area";
import { useChat } from "@/hooks/useChat";
import { useUiStore } from "@/stores/ui-store";

const LS_MODEL_KEY = "hermes-selected-model";

/** 从 localStorage 恢复上次选择的模型 ID */
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
 * 项目空间对话组件
 * —— 复用 CommandBox + useChat + ConversationArea，与 /new 页面保持一致
 * —— 支持 ?load=conversationId 自动加载从 /new 关联的对话
 */
export function ProjectChat() {
  return (
    <Suspense fallback={null}>
      <ProjectChatInner />
    </Suspense>
  );
}

function ProjectChatInner() {
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
  } = useChat();

  const input = useUiStore((s) => s.newTopicInput);
  const setInput = useUiStore((s) => s.setNewTopicInput);
  const pendingSystemPrompt = useUiStore((s) => s.newTopicPendingSystemPrompt);
  const clearNewTopicInput = useUiStore((s) => s.clearNewTopicInput);
  const selectedModelId = useUiStore((s) => s.newTopicModelId);
  const setSelectedModelId = useUiStore((s) => s.setNewTopicModelId);

  // 从 /new 跳转时通过 ?load=conversationId 自动加载关联对话
  const searchParams = useSearchParams();
  useEffect(() => {
    const loadId = searchParams.get("load");
    if (loadId) {
      loadConversation(loadId);
    }
  }, [searchParams, loadConversation]);

  // 挂载后恢复模型选择
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

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    const model = SELECTABLE_MODELS.find((m) => m.id === selectedModelId);
    const apiModelId = model?.modelId;

    // 解析输入中的 @智能体、#项目、/命令
    const slashCommands = input.match(/\/ft-\S+/g) ?? [];
    let enhancedSystemPrompt = pendingSystemPrompt;
    if (slashCommands.length > 0) {
      const cmdContext = `用户触发了以下技能命令: ${slashCommands.join(", ")}。请按对应技能的职责处理请求。`;
      enhancedSystemPrompt = enhancedSystemPrompt
        ? `${enhancedSystemPrompt}\n\n${cmdContext}`
        : cmdContext;
    }

    sendMessage(input.trim(), enhancedSystemPrompt, apiModelId);
    clearNewTopicInput();
  }, [input, isStreaming, sendMessage, pendingSystemPrompt, selectedModelId, clearNewTopicInput]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-background">
      {/* 对话历史 — 撑满上方空间 */}
      {hasMessages && (
        <div className="flex-1 min-h-0 overflow-hidden px-4 md:px-8 pt-6">
          <div className="h-full max-w-2xl mx-auto">
            <ConversationArea
              messages={messages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              conversationId={conversationId}
              onClearMessages={clearMessages}
            />
          </div>
        </div>
      )}

      {/* 空状态引导 */}
      {!hasMessages && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8">
          <div className="w-full max-w-2xl text-center space-y-3">
            <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
              <span className="text-primary text-sm font-bold">H</span>
            </div>
            <p className="text-foreground text-sm font-semibold">
              在此项目空间开始会话
            </p>
            <p className="text-muted-foreground text-xs max-w-[280px] mx-auto leading-relaxed">
              下方输入框与【新话题】完全一致，支持文件上传、语音、URL 解析、@智能体、#项目、/命令。
            </p>
          </div>
        </div>
      )}

      {/* 输入框 — 固定在底部，与 /new 完全一致 */}
      <div className="shrink-0 px-4 md:px-8 pb-4 pt-2">
        <div className="max-w-2xl mx-auto">
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
    </div>
  );
}

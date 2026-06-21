"use client";

import { Suspense, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CommandBox } from "@/components/pages/new/command-box";
import { ConversationArea } from "@/components/pages/new/conversation-area";
import { useChat } from "@/hooks/useChat";
import { SELECTABLE_MODELS } from "@/config/models";
import { useUiStore } from "@/stores/ui-store";
import { ModelSelectorInline } from "@/components/workspace/ModelSelectorInline";
import { useModelPreference } from "@/hooks/use-model-preference";


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
    currentTrace,
  } = useChat();

  const input = useUiStore((s) => s.newTopicInput);
  const setInput = useUiStore((s) => s.setNewTopicInput);
  const pendingSystemPrompt = useUiStore((s) => s.newTopicPendingSystemPrompt);
  const clearNewTopicInput = useUiStore((s) => s.clearNewTopicInput);
  const storeSetModelId = useUiStore((s) => s.setNewTopicModelId);

  // 模型选择偏好 Hook（localStorage 恢复 + 持久化，同步到 Zustand ui-store）
  const { selectedModelId, handleModelChange, getApiModelId } = useModelPreference(
    storeSetModelId,
  );

  // 从 /new 跳转时通过 ?load=conversationId 自动加载关联对话
  const searchParams = useSearchParams();
  useEffect(() => {
    const loadId = searchParams.get("load");
    if (loadId) {
      loadConversation(loadId);
    }
  }, [searchParams, loadConversation]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    const apiModelId = getApiModelId();

    // 解析输入中的 @智能体、#项目、/命令（与 /new 页面一致）
    const agentMentions = input.match(/@(\S+)/g)?.map((m: string) => m.slice(1)) ?? [];
    const projectRefs = input.match(/#(\S+)/g)?.map((m: string) => m.slice(1)) ?? [];
    const slashCommands = input.match(/\/ft-\S+/g) ?? [];

    // 构建增强的 system prompt（合并命令、智能体上下文、项目引用）
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

  const hasMessages = messages.length > 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-background">
      {/* 顶部操作控制栏（常驻） */}
      <div className="sticky top-0 flex justify-between items-center px-4 md:px-8 py-3 bg-background/95 backdrop-blur z-20 shrink-0">
        {/* 左侧：模型选择器 */}
        <ModelSelectorInline
          value={selectedModelId}
          onChange={handleModelChange}
          disabled={isStreaming}
        />
      </div>

      {/* 对话历史 — 撑满上方空间 */}
      {hasMessages && (
        <div className="flex-1 min-h-0 overflow-hidden px-4 md:px-8 pt-6">
          <div className="h-full max-w-2xl mx-auto">
            <ConversationArea
              messages={messages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              currentTrace={currentTrace}
              conversationId={conversationId}
              onClearMessages={clearMessages}
              onEditMessage={setInput}
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
          />
        </div>
      </div>
    </div>
  );
}

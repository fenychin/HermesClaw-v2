"use client";

import { useState, useCallback } from "react";
import { PageTransition } from "@/components/common/PageTransition";
import { ConversationArea } from "@/components/pages/new/conversation-area";
import { useChat } from "@/hooks/useChat";
import { NewPageInput } from "./_components/NewPageInput";
import { NewPageQuickActions } from "./_components/NewPageQuickActions";
import { NewModelSelector } from "./_components/NewModelSelector";

/**
 * 新话题页面（超级入口）
 * —— 重构为 Apple-style 的极简超级入口
 * —— 页面仅包含居中核心输入框和 2x2 的快捷操作网格，无 Banner、工作流大列表与右边栏建议
 * —— 模型选择器绝对定位在整个页面最左上角，与视口左边缘对齐，且移除了滚动条限制
 */
export default function NewTopicPage() {
  // 对话状态（useChat hook 管理流式 API 交互）
  const {
    messages,
    isStreaming,
    streamingContent,
    sendMessage,
    clearMessages,
  } = useChat();

  // 输入框文本值状态
  const [input, setInput] = useState("");
  
  // 选中的模型 ID（默认选中 Claude Sonnet 4.6）
  const [selectedModelId, setSelectedModelId] = useState("claude-sonnet-4-6");

  // 由快捷卡片带入的专属 system prompt（外贸专项角色）；发送后清空
  const [pendingSystemPrompt, setPendingSystemPrompt] = useState<
    string | undefined
  >(undefined);

  // 是否已存在对话消息
  const hasMessages = messages.length > 0;

  // 发送消息回调（携带专属 system prompt，若有）
  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim(), pendingSystemPrompt);
    setInput("");
    setPendingSystemPrompt(undefined);
  }, [input, isStreaming, sendMessage, pendingSystemPrompt]);

  // 快捷卡片点击 → 填入输入框，记录专属 system prompt 并支持后续发送
  const handleQuickActionSelect = useCallback(
    (prompt: string, systemPrompt?: string) => {
      setInput(prompt);
      setPendingSystemPrompt(systemPrompt);
    },
    [],
  );

  return (
    <PageTransition>
      <div className="h-full flex flex-col px-6 md:px-8 overflow-hidden bg-background relative">
        {/* 极简模型选择器：放置在整个页面最左上角，对齐视口左边缘 */}
        {!hasMessages && (
          <div className="absolute top-6 left-6 md:left-8">
            <NewModelSelector
              selectedId={selectedModelId}
              onSelect={setSelectedModelId}
              disabled={isStreaming}
            />
          </div>
        )}

        {!hasMessages ? (
          // 空状态下：整页居中布局，20vh 顶部留白，内容区最大宽度 max-w-2xl
          <div className="w-full max-w-2xl mx-auto flex flex-col justify-center min-h-full py-8">
            {/* 顶部 20vh 留白 */}
            <div className="h-[20vh] shrink-0" />
            
            {/* 核心输入框 */}
            <NewPageInput
              value={input}
              onChange={setInput}
              onSubmit={handleSend}
              disabled={isStreaming}
            />
            
            {/* 快捷卡片区 (输入框下方 mt-6) */}
            <NewPageQuickActions onSelect={handleQuickActionSelect} />
          </div>
        ) : (
          // 有消息时：展示流式对话区域，输入框放置于底部
          <div className="w-full max-w-2xl mx-auto flex flex-col flex-1 min-h-0 py-6 space-y-4">
            {/* 对话消息展示区域 */}
            <ConversationArea
              messages={messages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              onClearMessages={clearMessages}
            />
            
            {/* 核心输入框 */}
            <div className="shrink-0 pt-2">
              <NewPageInput
                value={input}
                onChange={setInput}
                onSubmit={handleSend}
                disabled={isStreaming}
              />
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

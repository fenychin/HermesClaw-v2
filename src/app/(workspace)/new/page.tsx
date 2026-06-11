"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
import type { RecentRecord } from "@/hooks/use-recent-conversations";
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

  const router = useRouter();

  // 从 /recent 点击跳转时通过 ?load=conversationId 自动加载历史对话
  const searchParams = useSearchParams();
  useEffect(() => {
    const loadId = searchParams.get("load");
    if (loadId) {
      loadConversation(loadId);
    }
  }, [searchParams, loadConversation]);

  const [input, setInput] = useState("");
  // 初始值用确定性默认（与服务端 SSR 一致），避免 localStorage 读值导致首屏水合不匹配
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [pendingSystemPrompt, setPendingSystemPrompt] = useState<string | undefined>(undefined);

  // 挂载后从 localStorage 恢复上次选择的模型（仅客户端，不参与水合比对）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedModelId(loadSavedModel());
  }, []);

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

  // 点击「最近」记录：优先用记录自带 href（如询盘派生项）；
  // 否则按 type 分流——真实对话→恢复历史，项目→详情，任务→最近页。
  const handleRecentSelect = useCallback(
    (record: RecentRecord) => {
      if (record.href) {
        router.push(record.href);
      } else if (record.type === "conversation") {
        loadConversation(record.id);
      } else if (record.type === "project") {
        router.push(`/projects/${record.id}`);
      } else {
        router.push("/recent");
      }
    },
    [loadConversation, router],
  );

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

          {/* 快捷卡片 + 最近记录（仅空状态展示） */}
          {!hasMessages && (
            <>
              <div className="w-full max-w-2xl">
                <QuickCards onSelect={handleQuickActionSelect} />
              </div>
              <div className="w-full max-w-2xl">
                <RecentPanel onSelect={handleRecentSelect} />
              </div>
            </>
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

"use client";

import { Suspense, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { CommandBox } from "@/components/pages/new/command-box";
import { ConversationArea } from "@/components/pages/new/conversation-area";
import { useChat } from "@/hooks/useChat";
import { SELECTABLE_MODELS } from "@/config/models";
import { useUiStore } from "@/stores/ui-store";
import { ModelSelectorInline } from "@/components/workspace/ModelSelectorInline";
import { useModelPreference } from "@/hooks/use-model-preference";
import { useProjectContextStore } from "@/stores/project-context-store";
import { cn } from "@/lib/utils";



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
  const params = useParams();
  const projectId = params?.id as string;
  const store = useProjectContextStore();
  const { instruction, files, skills, connections } = store.getProjectContext(projectId);

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

  // 从 /new 跳转时通过 ?load=conversationId 自动加载关联对话，并传入 projectId 执行自动转存
  const searchParams = useSearchParams();
  const loadId = searchParams.get("load");
  const prevLoadIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadId) {
      loadConversation(loadId, projectId);
    } else if (prevLoadIdRef.current !== null) {
      // 只有当之前加载了历史对话，且现在的 loadId 被清空（用户点击了开启新对话）时，才重置对话状态
      clearMessages();
    }
    prevLoadIdRef.current = loadId;
  }, [loadId, loadConversation, projectId, clearMessages]);

  const handleSend = useCallback((finalPrompt?: string) => {
    const activePrompt = typeof finalPrompt === "string" ? finalPrompt : input.trim();
    if (!activePrompt || isStreaming) return;
    const apiModelId = getApiModelId();

    // 解析输入中的 @智能体、#项目、/命令（与 /new 页面一致）
    const agentMentions = activePrompt.match(/@(\S+)/g)?.map((m: string) => m.slice(1)) ?? [];
    const projectRefs = activePrompt.match(/#(\S+)/g)?.map((m: string) => m.slice(1)) ?? [];
    const slashCommands = activePrompt.match(/\/ft-\S+/g) ?? [];

    // 1. 构建该项目的系统级上下文 (Project Context) —— 打通右侧配置面板
    let projectContextPrompt = `你目前正在协助用户处理该项目。以下是当前项目的配置和上下文信息，它是指导你本次会话的最高规则与规范：\n`;
    if (instruction?.content) {
      projectContextPrompt += `【项目指令】\n${instruction.content}\n\n`;
    }
    if (files && files.length > 0) {
      projectContextPrompt += `【项目文件】\n${files.map((f) => `- ${f.name} (大小: ${f.size}B, 类型: ${f.type})`).join("\n")}\n\n`;
    }
    if (skills && skills.length > 0) {
      projectContextPrompt += `【绑定技能】\n${skills.map((s) => `- ${s.name}: ${s.description}`).join("\n")}\n\n`;
    }
    if (connections && connections.length > 0) {
      projectContextPrompt += `【优先连接】\n${connections.map((c) => `- ${c.title} (${c.url})`).join("\n")}\n\n`;
    }

    // 2. 构建增强的 system prompt（合并项目上下文、命令、智能体上下文、项目引用）
    let enhancedSystemPrompt = projectContextPrompt;
    if (pendingSystemPrompt) {
      enhancedSystemPrompt += `${pendingSystemPrompt}\n\n`;
    }
    if (slashCommands.length > 0) {
      enhancedSystemPrompt += `用户触发了以下技能命令: ${slashCommands.join(", ")}。请按对应技能的职责处理请求。\n\n`;
    }
    if (agentMentions.length > 0) {
      enhancedSystemPrompt += `用户 @提及了以下智能体: ${agentMentions.join(", ")}。请以协作模式与这些智能体配合。\n\n`;
    }
    if (projectRefs.length > 0) {
      enhancedSystemPrompt += `用户引用了以下项目空间: ${projectRefs.join(", ")}。请将结果关联至对应项目。\n\n`;
    }

    // 调用 useChat sendMessage 并透传 projectId
    sendMessage(activePrompt, enhancedSystemPrompt, apiModelId, undefined, undefined, projectId);
    clearNewTopicInput();
  }, [
    input,
    isStreaming,
    sendMessage,
    pendingSystemPrompt,
    getApiModelId,
    clearNewTopicInput,
    instruction,
    files,
    skills,
    connections,
    projectId,
  ]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto relative bg-background">
      {/* 顶部操作控制栏（常驻） */}
      <div className="sticky top-0 flex justify-between items-center px-4 md:px-8 py-3 bg-background/95 backdrop-blur z-20 shrink-0">
        {/* 左侧：模型选择器 */}
        <ModelSelectorInline
          value={selectedModelId}
          onChange={handleModelChange}
          disabled={isStreaming}
        />
      </div>

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
      <div
        className={cn(
          "px-4 md:px-8 w-full",
          hasMessages
            ? "sticky bottom-0 shrink-0 pb-6 pt-2 bg-background/95 backdrop-blur z-10"
            : "shrink-0 pb-4 pt-2",
        )}
      >
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

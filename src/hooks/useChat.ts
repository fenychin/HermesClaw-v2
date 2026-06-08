"use client";

import { useState, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api-client";

/** 单条对话消息 */
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

/**
 * 流式对话 Hook
 * —— 封装 POST /api/chat 的 SSE 流读取、状态管理和中断控制。
 *    对话完成后自动持久化到数据库。
 *
 * @returns
 *  - messages         完整的对话消息列表
 *  - isStreaming      是否正在流式接收中
 *  - streamingContent 当前正在流式输出的文本（用于实时渲染）
 *  - error            最近的错误信息
 *  - sendMessage      发送一条用户消息并开始流式对话
 *  - stopStreaming    中断当前流式响应
 *  - clearMessages    清空对话历史
 */
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** 当前持久化对话 ID */
  const conversationIdRef = useRef<string | null>(null);

  /**
   * 将当前对话持久化到数据库
   * —— 首次调用时创建 conversation，后续调用追加消息
   */
  const persistConversation = useCallback(
    async (userContent: string, assistantContent: string) => {
      try {
        // 若尚无对话 ID，创建新对话
        if (!conversationIdRef.current) {
          const title =
            userContent.length > 50
              ? userContent.slice(0, 50) + "…"
              : userContent;
          const result = await apiClient.createConversation(title);
          conversationIdRef.current = result.conversation.id;
        }

        // 写入用户消息和 AI 回复
        await apiClient.addMessage(
          conversationIdRef.current,
          "user",
          userContent,
        );
        await apiClient.addMessage(
          conversationIdRef.current,
          "assistant",
          assistantContent,
        );
      } catch {
        // 持久化失败不阻塞 UI
        console.warn("对话持久化失败，将在下次对话时重试");
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (content: string, systemPrompt?: string) => {
      if (!content.trim() || isStreaming) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setStreamingContent("");
      setError(null);

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            systemPrompt,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) throw new Error("请求失败");
        if (!response.body) throw new Error("响应流为空");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  fullContent += parsed.text;
                  setStreamingContent(fullContent);
                }
              } catch {
                // 忽略解析失败的中间帧
              }
            }
          }
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: fullContent,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setStreamingContent("");

        // ---- 对话完成后持久化到数据库 ----
        persistConversation(content.trim(), fullContent);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message || "对话失败，请重试");
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [messages, isStreaming, persistConversation],
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingContent("");
    setError(null);
    // 清空时开启新对话会话
    conversationIdRef.current = null;
  }, []);

  return {
    messages,
    isStreaming,
    streamingContent,
    error,
    sendMessage,
    stopStreaming,
    clearMessages,
  };
}

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { parseSSEStream } from "@/lib/sse-parser";
import { toast } from "sonner";
import {
  queuePendingConversation,
  getPendingCount,
  flushPendingConversations,
  getFlushFailures,
} from "@/lib/pending-conversations";

/** 单条对话消息 */
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

/**
 * 流式对话 Hook
 * —— 封装 POST /api/chat 的 SSE 流读取（复用共享 parseSSEStream）、状态管理和中断控制。
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
 *  - loadConversation 从数据库加载历史对话
 *  - pendingCount     本地待回放队列积压数（>0 表示有未同步的历史记录）
 *  - flushPending     手动触发回放（挂载/网络恢复/保存成功后自动，通常无需手动）
 */
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** 当前持久化对话 ID */
  const conversationIdRef = useRef<string | null>(null);

  /** 本地待回放队列积压数（lazy init 直接读 localStorage，避免 effect 同步 setState） */
  const [pendingCount, setPendingCount] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return getPendingCount();
  });

  // 同步 count 的 flush 封装（含连续失败感知）
  const flush = useCallback(async () => {
    const flushed = await flushPendingConversations();
    if (flushed > 0) {
      setPendingCount(getPendingCount());
    } else if (getFlushFailures() >= 3) {
      toast.error("历史对话同步失败", {
        description: "已积压多条对话未同步，请检查网络后刷新页面",
      });
    }
  }, []);

  // 挂载时：尝试回放积压对话（计数已在 lazy init 就绪，此处只 flush）
  // flush 内部 setState 仅在异步成功后触发，非同步级联渲染
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    flush().catch(() => {});
  }, [flush]);

  // 网络恢复时：刷新计数并回放
  useEffect(() => {
    const onOnline = () => {
      setPendingCount(getPendingCount());
      flush().catch(() => {});
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  /**
   * 将当前对话持久化到数据库
   * —— 首次调用时创建 conversation，后续调用追加消息
   */
  const persistConversation = useCallback(
    async (userContent: string, assistantContent: string) => {
      try {
        if (!conversationIdRef.current) {
          const title =
            userContent.length > 50
              ? userContent.slice(0, 50) + "…"
              : userContent;
          const result = await apiClient.createConversation(title);
          conversationIdRef.current = result.conversation.id;
        }

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
        // 本次保存成功 → 尝试回放之前积压的失败对话 + 通知侧边栏/面板刷新
        flush().catch(() => {});
        window.dispatchEvent(new CustomEvent("conversation-saved"));
      } catch {
        toast.error("对话保存失败", {
          description: "已暂存本地，网络恢复后自动同步",
        });
        // 两阶段写入可能部分失败（createConversation 成功但 addMessage 失败）
        // → 重置 conversationIdRef，避免下次追加到无消息的孤对话
        conversationIdRef.current = null;
        queuePendingConversation({
          userContent,
          assistantContent,
          time: Date.now(),
        });
        setPendingCount(getPendingCount());
      }
    },
    [flush],
  );

  const sendMessage = useCallback(
    async (content: string, systemPrompt?: string, modelId?: string) => {
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
            modelId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) throw new Error("请求失败");
        if (!response.body) throw new Error("响应流为空");

        let fullContent = "";
        const reader = response.body.getReader();

        // 复用共享 SSE 解析器（替换手写 ReadableStream 读取）
        await parseSSEStream(reader, {
          onData: (json) => {
            const parsed = json as { text?: string };
            if (parsed.text) {
              fullContent += parsed.text;
              setStreamingContent(fullContent);
            }
          },
        });

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: fullContent,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setStreamingContent("");

        // 对话完成后持久化到数据库
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
    conversationIdRef.current = null;
  }, []);

  /**
   * 从数据库加载历史对话（含重试）
   * —— 用于 /recent → /new?load= 跳转恢复会话
   */
  const loadConversation = useCallback(async (conversationId: string) => {
    setError(null);
    const MAX_RETRIES = 2;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await apiClient.getConversation(conversationId);
        const conv = (data as { conversation: { id: string; messages: Array<{ id: string; role: string; content: string; createdAt: string }> } }).conversation;
        if (!conv?.messages) return;

        const loaded: Message[] = conv.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: new Date(m.createdAt),
        }));
        setMessages(loaded);
        setStreamingContent("");
        conversationIdRef.current = conv.id;
        return; // 成功，退出
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          // 等待后重试（300ms 快速重试，减少导航等待感）
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    }

    toast.error("加载对话失败", {
      description: lastErr instanceof Error ? lastErr.message : "请稍后重试",
    });
  }, []);

  return {
    messages,
    isStreaming,
    streamingContent,
    error,
    sendMessage,
    stopStreaming,
    clearMessages,
    loadConversation,
    /** 本地待回放对话积压数（>0 表示有未同步的历史记录） */
    pendingCount,
    /** 手动触发回放（通常无需调用——挂载/网络恢复/每次保存成功自动触发） */
    flushPending: flush,
  };
}

"use client";

import { create } from "zustand";
import type { ChatMessage, ModelProvider } from "@/types/chat";

/**
 * 对话状态
 *
 * 职责划分：
 * - Zustand 承载 UI / 客户端交互态（消息列表、输入、发送中标志）
 * - 实际 HTTP 请求不作为 store 持久状态，由 sendMessage 触发
 */
interface ChatState {
  /** 当前对话消息列表 */
  messages: ChatMessage[];
  /** 输入框文本 */
  input: string;
  /** 当前选中的模型提供商 */
  provider: ModelProvider;
  /** 是否正在流式接收 AI 回复 */
  isStreaming: boolean;

  /** 更新输入框文本 */
  setInput: (value: string) => void;
  /** 切换模型提供商 */
  setProvider: (provider: ModelProvider) => void;
  /** 发送消息（POST /api/chat → SSE 流式追加回复） */
  sendMessage: () => Promise<void>;
  /** 清空消息列表 */
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  input: "",
  provider: "deepseek",
  isStreaming: false,

  setInput: (value) => set({ input: value }),

  setProvider: (provider) => set({ provider }),

  clearMessages: () => set({ messages: [] }),

  sendMessage: async () => {
    const { input, provider, messages } = get();
    const trimmed = input.trim();
    if (!trimmed || get().isStreaming) return;

    // ---- 1. 构建消息列表 ----
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    const messagesToSend = [...messages, userMsg]; // 不含空 assistant 占位

    set({
      messages: [...messages, userMsg, assistantMsg],
      input: "",
      isStreaming: true,
    });

    // ---- 2. 调用 API ----
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          messages: messagesToSend,
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "未知错误" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      // ---- 3. 逐行读取 SSE 流 ----
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.content) {
              // 增量追加到最新 assistant 消息
              set((state) => {
                const msgs = [...state.messages];
                const last = msgs[msgs.length - 1];
                if (last && last.role === "assistant") {
                  msgs[msgs.length - 1] = {
                    ...last,
                    content: last.content + (parsed.content as string),
                  };
                }
                return { messages: msgs };
              });
            }
          } catch (e) {
            // 数据行解析失败 → 若是 JSON 内的 error 则抛出，否则跳过
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    } catch (err) {
      // 追加错误信息到 assistant 消息
      const errorMsg =
        err instanceof Error ? err.message : "发送失败，请重试";
      set((state) => {
        const msgs = [...state.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") {
          msgs[msgs.length - 1] = {
            ...last,
            content: last.content
              ? `${last.content}\n\n⚠️ ${errorMsg}`
              : `⚠️ ${errorMsg}`,
          };
        }
        return { messages: msgs };
      });
    } finally {
      set({ isStreaming: false });
    }
  },
}));

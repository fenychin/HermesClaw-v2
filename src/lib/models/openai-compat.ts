/**
 * OpenAI 兼容协议适配器
 * —— DeepSeek、OpenAI、MiniMax 均兼容此协议，仅 baseURL / model / apiKey 不同。
 */

import type { ModelAdapter } from "./types";
import type { ChatMessage } from "@/types/chat";

export interface OpenAICompatConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

/**
 * 创建 OpenAI 兼容协议的流式对话适配器
 *
 * 协议：POST {baseURL}/v1/chat/completions
 * 请求体：{ model, messages, stream: true }
 * 响应：SSE 流，每行 data: {"choices":[{"delta":{"content":"..."}}]}
 */
export function createOpenAICompatAdapter(
  config: OpenAICompatConfig,
): ModelAdapter {
  const { baseURL, apiKey, model } = config;

  return {
    async *streamChat(messages: ChatMessage[], systemPrompt?: string) {
      const body: Record<string, unknown> = {
        model,
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        stream: true,
      };

      const res = await fetch(`${baseURL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "未知错误");
        throw new Error(
          `API 请求失败 (${res.status}): ${errText.slice(0, 300)}`,
        );
      }

      if (!res.body) {
        throw new Error("API 未返回响应体");
      }

      // 逐行解析 SSE 流
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // 最后一行可能不完整，保留到下次循环
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6); // 去掉 "data: "

          // 流结束标记
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta;
            if (delta?.content) {
              yield delta.content as string;

            }
          } catch {
            // 跳过无法解析的行
          }
        }
      }
    },
  };
}

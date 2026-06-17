/**
 * 模型适配器统一接口
 * —— 所有厂商适配器实现此接口，暴露异步可迭代的 streamChat。
 */

import type { ChatMessage } from "@/types/chat";

export interface ModelAdapter {
  /**
   * 流式对话
   * @param messages 对话消息列表（不含 system prompt）
   * @param systemPrompt 可选的系统指令
   * @returns 异步迭代器，每次 yield 一段文本增量
   */
  streamChat(
    messages: ChatMessage[],
    systemPrompt?: string,
  ): AsyncIterable<string>;
}

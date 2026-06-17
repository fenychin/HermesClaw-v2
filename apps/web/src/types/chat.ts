/**
 * 对话相关类型定义
 * —— 覆盖多模型提供商、消息、请求/响应结构。
 */

/** 支持的 AI 模型提供商 */
export type ModelProvider = "deepseek" | "openai" | "anthropic" | "gemini" | "minimax";

/** 单条对话消息 */
export interface ChatMessage {
  /** 角色 */
  role: "user" | "assistant";
  /** 消息文本内容 */
  content: string;
}

/** POST /api/chat 请求体 */
export interface ChatRequest {
  /** 模型提供商 */
  provider: ModelProvider;
  /** 对话消息列表 */
  messages: ChatMessage[];
}

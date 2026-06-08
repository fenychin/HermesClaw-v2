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

/** 模型选择器下拉项 */
export interface ModelOption {
  provider: ModelProvider;
  /** 显示名称 */
  label: string;
  /** 模型名称（如 deepseek-chat） */
  model: string;
  /** 简短描述 */
  description: string;
}

/** 前端可选的模型列表 */
export const AVAILABLE_MODELS: ModelOption[] = [
  {
    provider: "deepseek",
    label: "DeepSeek",
    model: "deepseek-chat",
    description: "高性价比中文大模型",
  },
  {
    provider: "openai",
    label: "OpenAI GPT",
    model: "gpt-4o",
    description: "通用能力最强的多模态模型",
  },
  {
    provider: "anthropic",
    label: "Claude",
    model: "claude-opus-4-8",
    description: "最强大的长上下文与代码模型",
  },
  {
    provider: "gemini",
    label: "Gemini",
    model: "gemini-2.5-flash",
    description: "Google 多模态大模型",
  },
  {
    provider: "minimax",
    label: "MiniMax",
    model: "abab6.5s-chat",
    description: "国产轻量对话模型",
  },
] as const;

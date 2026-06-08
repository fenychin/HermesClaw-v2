/**
 * 模型适配器注册表
 * —— 按 provider 查找对应的适配器实例，统一管理模型配置。
 */

import { createOpenAICompatAdapter } from "./openai-compat";
import type { ModelAdapter } from "./types";
import type { ModelProvider } from "@/types/chat";

/**
 * 模型提供商配置
 * —— OpenAI 兼容协议（DeepSeek / OpenAI / MiniMax）共用同一适配器基类。
 *    后续若加入 Anthropic / Gemini ，需独立实现 ModelAdapter 接口并在这里注册。
 */
const MODEL_CONFIGS: Record<
  string,
  { baseURL: string; model: string; apiKeyEnv: string }
> = {
  deepseek: {
    baseURL: "https://api.deepseek.com",
    model: "deepseek-chat",
    apiKeyEnv: "DEEPSEEK_API_KEY",
  },
  openai: {
    baseURL: "https://api.openai.com",
    model: "gpt-4o",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  minimax: {
    baseURL: "https://api.minimax.chat",
    model: "abab6.5s-chat",
    apiKeyEnv: "MINIMAX_API_KEY",
  },
};

/** 已创建的适配器缓存（避免重复 new） */
const adapterCache = new Map<string, ModelAdapter>();

/**
 * 获取指定 provider 的模型适配器
 *
 * @returns 适配器实例，若 provider 不支持或 API key 未配置则返回 null
 */
export function getAdapter(provider: string): ModelAdapter | null {
  const cfg = MODEL_CONFIGS[provider];
  if (!cfg) return null;

  const apiKey = process.env[cfg.apiKeyEnv];
  if (!apiKey) return null;

  const cacheKey = `${provider}:${cfg.model}`;
  let adapter = adapterCache.get(cacheKey);
  if (!adapter) {
    adapter = createOpenAICompatAdapter({
      baseURL: cfg.baseURL,
      apiKey,
      model: cfg.model,
    });
    adapterCache.set(cacheKey, adapter);
  }
  return adapter;
}

/**
 * 获取前端可选的模型列表（仅返回已配置 API key 的 provider）
 */
export function getAvailableProviders(): ModelProvider[] {
  const available: ModelProvider[] = [];
  for (const [provider, cfg] of Object.entries(MODEL_CONFIGS)) {
    if (process.env[cfg.apiKeyEnv]) {
      available.push(provider as ModelProvider);
    }
  }
  return available;
}

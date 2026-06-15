/**
 * 模型配置 —— 可选模型列表与默认模型（单一数据源）
 *
 * 供 CommandBox ModelSelectorInline、useModelPreference Hook
 * 以及 /api/chat 策略路由统一引用。
 */

export interface SelectableModel {
  id: string;
  provider: "anthropic" | "deepseek";
  label: string;
  version: string;
  color: string;
  modelId: string; // 传给 /api/chat 的实际模型名
  available: boolean;
}

export const SELECTABLE_MODELS: SelectableModel[] = [
  {
    id: "deepseek-v4-pro",
    provider: "deepseek",
    label: "DeepSeek",
    version: "V4 Pro",
    color: "bg-success",
    modelId: "deepseek-v4-pro",
    available: true,
  },
  {
    id: "deepseek-v4-flash",
    provider: "deepseek",
    label: "DeepSeek",
    version: "V4 Flash",
    color: "bg-success",
    modelId: "deepseek-v4-flash",
    available: true,
  },
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    label: "Claude",
    version: "Sonnet 4.6",
    color: "bg-warning",
    modelId: "claude-sonnet-4-6",
    available: true,
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude",
    version: "Haiku 4.5",
    color: "bg-warning",
    modelId: "claude-haiku-4-5",
    available: false,
  },
  {
    id: "claude-opus-4-8",
    provider: "anthropic",
    label: "Claude",
    version: "Opus 4.8",
    color: "bg-warning",
    modelId: "claude-opus-4-8",
    available: false,
  },
];

/** 默认选中的模型 */
export const DEFAULT_MODEL_ID = "deepseek-v4-pro";

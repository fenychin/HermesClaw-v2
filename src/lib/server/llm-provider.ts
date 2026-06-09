/**
 * LLM Provider 共享工具层
 *
 * 提取项目中多处重复的 Provider 选择逻辑、DeepSeek/Anthropic 调用模板，
 * 供 WorkflowGenerator、Harness 评估、Spec 生成等模块复用。
 *
 * ⚠️ 仅在服务端调用，切勿在客户端引入（包含 API Key）。
 */
import anthropic from "@/lib/anthropic"
import { parseJsonLoose } from "@/lib/harness-llm"

// ---- 类型 ----

/** LLM Provider 标识 */
export type LlmProvider = "anthropic" | "deepseek"

/** Provider 选择结果 */
export interface LlmProviderSelection {
  provider: LlmProvider
  /** 使用的模型 ID */
  model: string
}

/** DeepSeek JSON 模式调用参数 */
export interface DeepSeekJsonOptions {
  systemPrompt: string
  userPrompt: string
  /** 模型 ID，默认 deepseek-chat */
  model?: string
  /** 最大 token 数，默认 4096 */
  maxTokens?: number
  /** 采样温度，默认 0.4 */
  temperature?: number
}

/** Anthropic 文本调用参数 */
export interface AnthropicTextOptions {
  systemPrompt: string
  userPrompt: string
  /** 模型 ID，默认 claude-sonnet-4-6 */
  model?: string
  /** 最大 token 数，默认 4096 */
  maxTokens?: number
}

// ---- Provider 选择 ----

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"

/**
 * 统一 LLM Provider 选择逻辑（与 harness-llm.ts 策略一致）
 *
 * 优先级：
 *   1. HARNESS_LLM_PROVIDER 环境变量显式覆盖
 *   2. ANTHROPIC_API_KEY 已配置 → Anthropic
 *   3. DEEPSEEK_API_KEY 已配置 → DeepSeek 回退
 *   4. 都未配置 → 抛出错误
 */
export function resolveLlmProvider(
  preferredModel?: string,
): LlmProviderSelection {
  const override = process.env.HARNESS_LLM_PROVIDER?.toLowerCase().trim()
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY?.trim())

  if (override === "deepseek") {
    if (!hasDeepSeek) {
      throw new Error("HARNESS_LLM_PROVIDER=deepseek 但未配置 DEEPSEEK_API_KEY")
    }
    return { provider: "deepseek", model: preferredModel ?? DEFAULT_DEEPSEEK_MODEL }
  }
  if (override === "anthropic") {
    if (!hasAnthropic) {
      throw new Error("HARNESS_LLM_PROVIDER=anthropic 但未配置 ANTHROPIC_API_KEY")
    }
    return { provider: "anthropic", model: preferredModel ?? DEFAULT_ANTHROPIC_MODEL }
  }

  if (hasAnthropic) {
    return { provider: "anthropic", model: preferredModel ?? DEFAULT_ANTHROPIC_MODEL }
  }
  if (hasDeepSeek) {
    return { provider: "deepseek", model: preferredModel ?? DEFAULT_DEEPSEEK_MODEL }
  }

  throw new Error(
    "未配置 ANTHROPIC_API_KEY 或 DEEPSEEK_API_KEY，无法调用 LLM",
  )
}

// ---- DeepSeek JSON 模式调用 ----

/**
 * 调用 DeepSeek Chat API（JSON 模式），返回解析后的 JSON 对象。
 */
export async function callDeepSeekJson(
  options: DeepSeekJsonOptions,
): Promise<unknown> {
  const {
    systemPrompt,
    userPrompt,
    model = DEFAULT_DEEPSEEK_MODEL,
    maxTokens = 4096,
    temperature = 0.4,
  } = options

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY 未配置")
  }

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => "")
    throw new Error(
      `DeepSeek 请求失败 (${res.status})：${errBody.slice(0, 200)}`,
    )
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error("DeepSeek 未返回内容")
  }

  // 复用 harness-llm.ts 的 JSON 解析器（静态导入）
  return parseJsonLoose(content)
}

// ---- Anthropic 文本调用 ----

/**
 * 调用 Anthropic Messages API，返回模型输出的纯文本。
 */
export async function callAnthropicText(
  options: AnthropicTextOptions,
): Promise<string> {
  const {
    systemPrompt,
    userPrompt,
    model = DEFAULT_ANTHROPIC_MODEL,
    maxTokens = 4096,
  } = options

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic 未返回文本内容")
  }

  return textBlock.text
}

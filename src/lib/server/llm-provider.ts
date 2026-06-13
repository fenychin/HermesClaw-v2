/**
 * LLM Provider 共享工具层
 *
 * 提取项目中多处重复的 Provider 选择逻辑、DeepSeek/Anthropic 调用模板，
 * 供 WorkflowGenerator、Harness 评估、Spec 生成等模块复用。
 *
 * ⚠️ 仅在服务端调用，切勿在客户端引入（包含 API Key）。
 */
import anthropic from "@/lib/anthropic"
import { parseJsonLoose } from "@/lib/server/harness-llm"
import type { ModelProvider } from "@/types"

// ---- 类型 ----

/** LLM Provider 标识 */
export type LlmProvider = "anthropic" | "deepseek"

// 校验 LlmProvider 必须可被赋值给 ModelProvider (Assignable)
const _assert: LlmProvider extends ModelProvider ? true : never = true

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

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"

/** DeepSeek Chat API 端点（OpenAI 兼容） */
const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/v1/chat/completions"

/**
 * 某个 Provider 的 API Key 是否已配置。
 * 统一 key 可用性判定，供 resolveLlmProvider / model-router 等复用，
 * 避免在多处重复 process.env 检查。
 */
export function isProviderAvailable(provider: LlmProvider): boolean {
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim())
}

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
  const hasAnthropic = isProviderAvailable("anthropic")
  const hasDeepSeek = isProviderAvailable("deepseek")

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

  const res = await fetch(DEEPSEEK_CHAT_URL, {
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

// ---- Anthropic 结构化输出 ----

/** Anthropic 结构化输出调用参数 */
export interface AnthropicStructuredOptions {
  systemPrompt: string
  userPrompt: string
  /** JSON Schema 定义（output_config.format.schema） */
  schema: Record<string, unknown>
  /** 模型 ID，默认 claude-sonnet-4-6 */
  model?: string
  /** 最大 token 数，默认 4096 */
  maxTokens?: number
  /** 是否启用 adaptive thinking（评估/分析类任务推荐开启） */
  thinking?: boolean
}

/**
 * 调用 Anthropic Messages API 的结构化输出（JSON Schema 模式）。
 *
 * —— 统一 hermes-suggestions / harness-llm / generate-spec 等
 *    需要结构化 JSON 输出的场景，消除各处重复的 anthropic.messages.create。
 *
 * @returns 已解析的 JSON 对象（经 parseJsonLoose 处理）
 */
export async function callAnthropicStructured(
  options: AnthropicStructuredOptions,
): Promise<unknown> {
  const {
    systemPrompt,
    userPrompt,
    schema,
    model = DEFAULT_ANTHROPIC_MODEL,
    maxTokens = 4096,
    thinking = false,
  } = options

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    ...(thinking ? { thinking: { type: "adaptive" as const } } : {}),
    output_config: {
      format: {
        type: "json_schema" as const,
        schema,
      },
    },
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic 结构化输出未返回文本内容")
  }

  return parseJsonLoose(textBlock.text)
}

// ---- 上游错误映射 ----

/** 上游 API 错误码 → 友好 HTTP 状态码与信息 */
export interface UpstreamErrorInfo {
  status: number
  message: string
}

/** DeepSeek / OpenAI 兼容上游错误分类（路由层复用，与 Anthropic 对齐友好降级） */
export function classifyUpstreamError(httpStatus: number): UpstreamErrorInfo {
  if (httpStatus === 401) {
    return { status: 503, message: "AI 服务密钥配置有误，请联系管理员" }
  }
  if (httpStatus === 429) {
    return { status: 429, message: "AI 服务暂时繁忙，请 30 秒后重试" }
  }
  if (httpStatus >= 500) {
    return { status: 503, message: "AI 上游服务故障，请稍后重试" }
  }
  return { status: 502, message: `AI 服务请求失败 (${httpStatus})` }
}

// ---- 共享流式调用 ----

/** 流式对话消息 */
export interface StreamMessage {
  role: string
  content: string
}

/** 流式调用参数 */
export interface OpenChatStreamOptions {
  /** Provider */
  provider: LlmProvider
  /** 模型 ID */
  model: string
  /** 系统提示词 */
  system: string
  /** 对话历史 */
  messages: StreamMessage[]
  /** 最大生成 token 数，默认 2048 */
  maxTokens?: number
}

/** 文本增量回调：每收到一个 text delta 即调用 */
export type TextDeltaCallback = (text: string) => void | Promise<void>

/**
 * 打开 LLM 流式对话，按 Provider 分流式分支，通过统一回调推送文本增量。
 * —— 将 DeepSeek SSE 透传与 Anthropic messages.stream 收敛为同一接口，
 *    供 chat / workflow-generator / 后续流式端点复用，避免重复绕过共享层。
 *
 * @throws 上游错误时抛出（包含 UpstreamErrorInfo 的 detail）
 */
export async function openChatStream(
  options: OpenChatStreamOptions,
  onDelta: TextDeltaCallback,
): Promise<void> {
  const { provider, model, system, messages, maxTokens = 2048 } = options

  if (provider === "anthropic") {
    await streamAnthropicShared({ model, system, messages, maxTokens, onDelta })
    return
  }

  await streamDeepSeekShared({ model, system, messages, maxTokens, onDelta })
}

// ---- DeepSeek 共享流式（SSE 透传） ----

interface DeepSeekStreamArgs {
  model: string
  system: string
  messages: StreamMessage[]
  maxTokens: number
  onDelta: TextDeltaCallback
}

async function streamDeepSeekShared({
  model,
  system,
  messages,
  maxTokens,
  onDelta,
}: DeepSeekStreamArgs): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY 未配置")
  }

  const res = await fetch(DEEPSEEK_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.7,
      stream: true,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => "")
    const classified = classifyUpstreamError(res.status)
    throw Object.assign(new Error(`${classified.message} (${res.status})`), {
      upstreamStatus: res.status,
      upstreamBody: errBody.slice(0, 500),
      classified,
    })
  }

  if (!res.body) {
    throw new Error("DeepSeek 响应流为空")
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split("\n")
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith("data: ")) continue

        const data = trimmed.slice(6)
        if (data === "[DONE]") return

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) await onDelta(content)
        } catch {
          // 跳过解析失败的中间帧
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ---- Anthropic 共享流式（SDK messages.stream） ----

interface AnthropicStreamArgs {
  model: string
  system: string
  messages: StreamMessage[]
  maxTokens: number
  onDelta: TextDeltaCallback
}

async function streamAnthropicShared({
  model,
  system,
  messages,
  maxTokens,
  onDelta,
}: AnthropicStreamArgs): Promise<void> {
  if (!isProviderAvailable("anthropic")) {
    throw new Error("ANTHROPIC_API_KEY 未配置")
  }

  // Anthropic 仅接受 user / assistant 角色，system 单独传参
  const anthropicMessages = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))

  const stream = anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    system,
    messages: anthropicMessages,
  })

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta" &&
      event.delta.text
    ) {
      await onDelta(event.delta.text)
    }
  }
}

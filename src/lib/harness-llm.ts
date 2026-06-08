/**
 * Harness 自演化引擎 —— AI 分析层（Provider 抽象）
 *
 * 职责：将「最近运行日志摘要 + 指标」交给大模型分析，产出一份结构化的
 *       Harness 升级提案草稿（对应 AGENTS.md 第三章 Level 2 评估层）。
 *
 * Provider 策略：
 *   1. 配置了 ANTHROPIC_API_KEY → 使用 Anthropic claude-opus-4-8
 *      （adaptive thinking + 结构化输出，分析质量最高）。
 *   2. 否则回退到已配置的 DeepSeek（与 /api/chat 一致），保证无 Anthropic
 *      key 时功能依然可用；拿到官方 key 后无需改代码即自动切回 Opus 4.8。
 *
 * ⚠️ 仅在服务端（Route Handler / lib/server）调用，切勿在客户端引入。
 */
import anthropic from "@/lib/anthropic"
import type { RiskLevel, HarnessMetrics } from "@/types"

/** AI 产出的 Harness 升级提案核心字段（写库前的草稿） */
export interface HarnessProposalDraft {
  problemStatement: string
  evidence: string[]
  targetComponent: string
  proposedChange: string
  riskLevel: RiskLevel
  estimatedImpact: string
  /** Markdown 评估报告（推送维护者，AGENTS.md 4.6） */
  reportMd: string
}

/** 分析结果 + 溯源信息（呼应 AGENTS.md：决策须可溯源） */
export interface HarnessAnalysis {
  draft: HarnessProposalDraft
  provider: "anthropic" | "deepseek"
  model: string
}

/** 分析输入 */
export interface HarnessAnalysisInput {
  /** 最近运行日志摘要（已截断至前 N 条） */
  logSummary: string
  /** 指标快照 */
  metrics: HarnessMetrics
}

// 目标模型：拿到 ANTHROPIC_API_KEY 后自动启用 Opus 4.8；否则回退 DeepSeek
const ANTHROPIC_MODEL = "claude-opus-4-8"
const DEEPSEEK_MODEL = "deepseek-chat"

/** 六大核心组件枚举（AGENTS.md 第四章），约束 AI 的 targetComponent */
const TARGET_COMPONENTS = [
  "任务边界",
  "上下文供给",
  "工具接入",
  "反馈闭环",
  "安全护栏",
  "进化调度器",
] as const

/** 结构化输出 JSON Schema（Anthropic structured outputs 使用） */
const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    problemStatement: { type: "string", description: "当前 Harness 瓶颈的清晰描述" },
    evidence: {
      type: "array",
      items: { type: "string" },
      description: "支撑结论的证据（失败日志引用、性能数据等）",
    },
    targetComponent: {
      type: "string",
      enum: TARGET_COMPONENTS,
      description: "升级目标组件",
    },
    proposedChange: { type: "string", description: "具体变更建议" },
    riskLevel: { type: "string", enum: ["low", "mid", "high"], description: "风险等级" },
    estimatedImpact: { type: "string", description: "预期效果" },
    reportMd: {
      type: "string",
      description: "面向维护者的 Markdown 评估报告（含指标解读、瓶颈、建议）",
    },
  },
  required: [
    "problemStatement",
    "evidence",
    "targetComponent",
    "proposedChange",
    "riskLevel",
    "estimatedImpact",
    "reportMd",
  ],
  additionalProperties: false,
} as const

const SYSTEM_PROMPT = `你是 HermesClaw-v2 的 Harness 自演化引擎，正在执行 AGENTS.md 第三章定义的 Level 2 全系统评估。

你的任务：分析智能体最近的运行日志与指标，识别 Harness（驾驭层）的性能瓶颈，产出一份可供人工审批的升级提案（HEP）。

判断与措辞要求：
- targetComponent 必须落在六大核心组件之一：任务边界 / 上下文供给 / 工具接入 / 反馈闭环 / 安全护栏 / 进化调度器。
- evidence 必须引用具体日志或指标，禁止空泛套话。
- 若日志为空（最近窗口无任何运行记录），按 AGENTS.md 第五章「无日志的执行属严重违规」给出反馈闭环 / 进化调度器方向的提案。
- riskLevel 仅取 low / mid / high；涉及边界或安全护栏变更倾向 mid 或 high。
- 所有文本字段用中文。
- 这是一份升级建议，最终须经人工审批，不要假设会自动生效。`

/** 构造用户提示词 */
function buildUserPrompt({ logSummary, metrics }: HarnessAnalysisInput): string {
  return `运行日志（最近 ${metrics.windowHours} 小时，最多前 20 条）：
${logSummary}

指标快照：
- 总任务数：${metrics.total}
- 失败任务数：${metrics.errors}
- 失败率：${(metrics.errorRate * 100).toFixed(1)}%
- 成功率：${(metrics.successRate * 100).toFixed(1)}%

请基于以上数据生成一份 Harness 升级提案。`
}

/** 归一化风险等级：兼容模型可能返回的 medium / 中 等写法 */
function normalizeRiskLevel(value: unknown): RiskLevel {
  const v = String(value ?? "").toLowerCase().trim()
  if (v === "high" || v === "高") return "high"
  if (v === "mid" || v === "medium" || v === "中") return "mid"
  return "low"
}

/** 校验并收窄 AI 返回的原始对象为 HarnessProposalDraft */
function validateDraft(raw: unknown): HarnessProposalDraft {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI 返回结果不是合法对象")
  }
  const obj = raw as Record<string, unknown>

  const problemStatement = String(obj.problemStatement ?? "").trim()
  const proposedChange = String(obj.proposedChange ?? "").trim()
  const targetComponent = String(obj.targetComponent ?? "").trim()
  const estimatedImpact = String(obj.estimatedImpact ?? "").trim()

  if (!problemStatement || !proposedChange) {
    throw new Error("AI 返回结果缺少必要字段（problemStatement / proposedChange）")
  }

  const evidence = Array.isArray(obj.evidence)
    ? obj.evidence.map((e) => String(e)).filter(Boolean)
    : []

  const reportMd = String(obj.reportMd ?? "").trim()

  return {
    problemStatement,
    evidence,
    targetComponent: targetComponent || "进化调度器",
    proposedChange,
    riskLevel: normalizeRiskLevel(obj.riskLevel),
    estimatedImpact: estimatedImpact || "（模型未给出预期效果）",
    reportMd:
      reportMd ||
      `## Harness 评估报告\n\n- 问题：${problemStatement}\n- 目标组件：${targetComponent}\n- 建议：${proposedChange}`,
  }
}

/** 从可能含 ```json 包裹的文本中提取 JSON 并解析 */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    // 兜底：截取第一个 { 到最后一个 }
    const start = candidate.indexOf("{")
    const end = candidate.lastIndexOf("}")
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1))
    }
    throw new Error("无法从模型输出中解析出 JSON")
  }
}

/** Anthropic 路径：claude-opus-4-8 + adaptive thinking + 结构化输出 */
async function analyzeWithAnthropic(prompt: string): Promise<HarnessAnalysis> {
  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: {
      format: { type: "json_schema", schema: PROPOSAL_SCHEMA as Record<string, unknown> },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic 未返回文本内容")
  }

  return {
    draft: validateDraft(parseJsonLoose(textBlock.text)),
    provider: "anthropic",
    model: ANTHROPIC_MODEL,
  }
}

/** DeepSeek 路径：兜底分析，使用 JSON 模式（与 /api/chat 同一服务） */
async function analyzeWithDeepSeek(prompt: string): Promise<HarnessAnalysis> {
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
      model: DEEPSEEK_MODEL,
      max_tokens: 2048,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}

只输出一个 JSON 对象，不要任何额外文字或 Markdown 包裹，字段如下：
{
  "problemStatement": string,            // 问题描述
  "evidence": string[],                  // 证据列表
  "targetComponent": string,             // 任务边界|上下文供给|工具接入|反馈闭环|安全护栏|进化调度器 之一
  "proposedChange": string,              // 具体变更建议
  "riskLevel": "low" | "mid" | "high",   // 风险等级
  "estimatedImpact": string,             // 预期效果
  "reportMd": string                     // 面向维护者的 Markdown 评估报告（含指标解读、瓶颈、建议）
}`,
        },
        { role: "user", content: prompt },
      ],
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => "")
    throw new Error(`DeepSeek 请求失败 (${res.status})：${errBody.slice(0, 200)}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error("DeepSeek 未返回内容")
  }

  return {
    draft: validateDraft(parseJsonLoose(content)),
    provider: "deepseek",
    model: DEEPSEEK_MODEL,
  }
}

/**
 * 分析运行日志，产出 Harness 升级提案草稿。
 *
 * Provider 选择：
 *   - HARNESS_LLM_PROVIDER=anthropic|deepseek 时强制指定（便于在环境中已注入
 *     某个 key 但希望走另一路径时显式覆盖）。
 *   - 否则自动：有 ANTHROPIC_API_KEY 用 Anthropic（claude-opus-4-8），
 *     否则回退 DeepSeek。空字符串 / 纯空白的 key 视为未配置。
 */
export async function analyzeHarnessLogs(
  input: HarnessAnalysisInput,
): Promise<HarnessAnalysis> {
  const prompt = buildUserPrompt(input)

  const override = process.env.HARNESS_LLM_PROVIDER?.toLowerCase().trim()
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY?.trim())

  if (override === "deepseek") {
    if (!hasDeepSeek) {
      throw new Error("HARNESS_LLM_PROVIDER=deepseek 但未配置 DEEPSEEK_API_KEY")
    }
    return analyzeWithDeepSeek(prompt)
  }
  if (override === "anthropic") {
    if (!hasAnthropic) {
      throw new Error("HARNESS_LLM_PROVIDER=anthropic 但未配置 ANTHROPIC_API_KEY")
    }
    return analyzeWithAnthropic(prompt)
  }

  if (hasAnthropic) {
    return analyzeWithAnthropic(prompt)
  }
  if (hasDeepSeek) {
    return analyzeWithDeepSeek(prompt)
  }
  throw new Error(
    "未配置 ANTHROPIC_API_KEY 或 DEEPSEEK_API_KEY，无法执行 Harness AI 分析",
  )
}

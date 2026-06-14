/**
 * Harness 自演化引擎 —— AI 分析层（Provider 抽象）
 *
 * 职责：将「最近运行日志摘要 + 指标」交给大模型分析，产出一份结构化的
 *       Harness 升级提案草稿（对应 AGENTS.md 第三章 Level 2 评估层）。
 *
 * 🔄 P0 重构（2026-06-13）：
 *   - 移除内部 Provider 解析逻辑（analyzeHarnessLogs 不再自行决定用哪个 LLM），
 *     改由调用方经 model-router.selectModel() 决策后传入 provider + model。
 *   - 这确保了每次 Harness 评估的 LLM 调用都会产生 model.route 审计留痕。
 *   - 文件从 src/lib/harness-llm.ts 迁至 src/lib/server/harness-llm.ts，
 *     与服务端模块同目录，消除跨层引用。
 *
 * ⚠️ 仅在服务端（Route Handler / lib/server）调用，切勿在客户端引入。
 */
import type { RiskLevel, HarnessMetrics } from "@/types"
import type { LlmProvider } from "@/lib/server/llm-provider"
import { callAnthropicStructured, callDeepSeekJson } from "@/lib/server/llm-provider"

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
  provider: LlmProvider
  model: string
  /** AI 分析耗时（秒） */
  durationSeconds: number
}

/** 分析输入 */
export interface HarnessAnalysisInput {
  /** 最近运行日志摘要（已截断至前 N 条） */
  logSummary: string
  /** 指标快照 */
  metrics: HarnessMetrics
  /** 调用方经 selectModel() 决策后的 Provider */
  provider: LlmProvider
  /** 调用方经 selectModel() 决策后的 Model */
  model: string
}

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
    riskLevel: { type: "string", enum: ["low", "medium", "high"], description: "风险等级" },
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
- riskLevel 仅取 low / medium / high；涉及边界或安全护栏变更倾向 medium 或 high。
- 所有文本字段用中文。
- 这是一份升级建议，最终须经人工审批，不要假设会自动生效。`

/** 构造用户提示词 */
function buildUserPrompt({ logSummary, metrics }: Omit<HarnessAnalysisInput, "provider" | "model">): string {
  return `运行日志（最近 ${metrics.windowHours} 小时，最多前 20 条）：
${logSummary}

指标快照：
- 总任务数：${metrics.total}
- 失败任务数：${metrics.errors}
- 失败率：${(metrics.errorRate * 100).toFixed(1)}%
- 成功率：${(metrics.successRate * 100).toFixed(1)}%

请基于以上数据生成一份 Harness 升级提案。`
}

/** 归一化风险等级：兼容模型可能返回的 mid / 中 等旧写法 */
function normalizeRiskLevel(value: unknown): RiskLevel {
  const v = String(value ?? "").toLowerCase().trim()
  if (v === "high" || v === "高") return "high"
  if (v === "mid" || v === "medium" || v === "中") return "medium"
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

/**
 * Anthropic 路径：通过共享 llm-provider 调用结构化输出 + adaptive thinking。
 */
async function analyzeWithAnthropic(
  prompt: string,
  model: string,
): Promise<Omit<HarnessAnalysis, "durationSeconds">> {
  const raw = await callAnthropicStructured({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: prompt,
    schema: PROPOSAL_SCHEMA as Record<string, unknown>,
    model,
    maxTokens: 8000,
    thinking: true,
  })
  return {
    draft: validateDraft(raw),
    provider: "anthropic",
    model,
  }
}

/**
 * DeepSeek 路径：通过共享 llm-provider 调用 JSON 模式。
 */
async function analyzeWithDeepSeek(
  prompt: string,
  model: string,
): Promise<Omit<HarnessAnalysis, "durationSeconds">> {
  const raw = await callDeepSeekJson({
    systemPrompt: `${SYSTEM_PROMPT}

只输出一个 JSON 对象，不要任何额外文字或 Markdown 包裹，字段如下：
{
  "problemStatement": string,            // 问题描述
  "evidence": string[],                  // 证据列表
  "targetComponent": string,             // 任务边界|上下文供给|工具接入|反馈闭环|安全护栏|进化调度器 之一
  "proposedChange": string,              // 具体变更建议
  "riskLevel": "low" | "medium" | "high",   // 风险等级
  "estimatedImpact": string,             // 预期效果
  "reportMd": string                     // 面向维护者的 Markdown 评估报告（含指标解读、瓶颈、建议）
}`,
    userPrompt: prompt,
    model,
    maxTokens: 2048,
    temperature: 0.4,
  })
  return {
    draft: validateDraft(raw),
    provider: "deepseek",
    model,
  }
}

/**
 * 分析运行日志，产出 Harness 升级提案草稿。
 *
 * 🔄 P0 变更：provider + model 由调用方传入（调用方应先经 model-router.selectModel()
 * 决策，确保审计留痕），本函数不再自行解析环境变量选择 Provider。
 *
 * 请求失败时抛出错误，由上层 harness-eval.ts 捕获并写入 evolutionLog。
 */
export async function analyzeHarnessLogs(
  input: HarnessAnalysisInput,
): Promise<HarnessAnalysis> {
  const prompt = buildUserPrompt(input)
  const startTime = Date.now()

  let result: Omit<HarnessAnalysis, "durationSeconds">

  if (input.provider === "anthropic") {
    result = await analyzeWithAnthropic(prompt, input.model)
  } else {
    result = await analyzeWithDeepSeek(prompt, input.model)
  }

  return {
    ...result,
    durationSeconds: Math.round((Date.now() - startTime) / 100) / 10,
  }
}

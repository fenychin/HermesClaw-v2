/**
 * Hermes 今日主动建议 —— 服务端生成逻辑
 *
 * 体现 AGENTS.md 第一章「AI 不是工具，是第一工程主体」：用户一打开新话题页，
 * Hermes 就主动读取系统实时状态（待审批提案 / 24h 错误率 / 风险项目），交给
 * LLM 生成 3 条结构化今日工作建议，而非渲染静态文案。
 *
 * Provider/Model 选择经 selectModel() 策略路由决策并自动写入 AuditLog（§4.12），
 * LLM 调用统一通过 llm-provider.ts 共享工具层（callAnthropicStructured / callDeepSeekJson），
 * 不在本模块直接 import anthropic SDK 或手写 fetch。
 *
 * ⚠️ 仅服务端（Route Handler / lib/server）调用，切勿在客户端引入。
 */
import { prisma } from "@/lib/prisma"
import { isErrorStatus } from "@/lib/server/hermes/harness-eval"
import { selectModel } from "@/lib/server/shared/model-router"
import {
  callAnthropicStructured,
  callDeepSeekJson,
  isProviderAvailable,
} from "@/lib/server/shared/llm-provider"
import type {
  HermesSuggestion,
  HermesSuggestionsResult,
  HermesSystemSnapshot,
  SuggestionPriority,
  SuggestionRelatedTo,
} from "@/types"

/** 错误率统计窗口（小时） */
const WINDOW_HOURS = 24
/** 目标建议条数 */
const TARGET_COUNT = 3

/** 结构化输出 JSON Schema（Anthropic / DeepSeek 共用） */
const SUGGESTIONS_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      minItems: TARGET_COUNT,
      maxItems: TARGET_COUNT,
      items: {
        type: "object",
        properties: {
          priority: { type: "string", enum: ["high", "mid", "low"] },
          title: { type: "string", description: "建议标题，一句话" },
          action: { type: "string", description: "用户可直接执行的具体行动指令" },
          relatedTo: {
            type: "string",
            enum: ["agents", "projects", "harness"],
            description: "建议关联的系统模块",
          },
        },
        required: ["priority", "title", "action", "relatedTo"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const

const SYSTEM_PROMPT = `你是 HermesClaw-v2 的 Hermes 智能控制面，面向中小企业外贸行业的 AI 数字员工系统核心规划引擎。
你的职责是在用户打开工作台时，主动基于系统实时状态给出今日最该做的工作建议（AI-First：你是第一工程主体，主动规划而非被动等待）。

要求：
- 恰好输出 ${TARGET_COUNT} 条建议，按优先级从高到低排列。
- 每条建议聚焦一个可立即推进的具体动作，避免空泛套话。
- priority 取 high / mid / low；relatedTo 取 agents / projects / harness 之一，须与建议内容匹配。
- title 一句话点题；action 是用户可直接执行的指令（会被填入输入框发给数字员工）。
- 当待审批提案 > 0 时，至少 1 条关联 harness；错误率偏高时优先关注 agents；有风险项目时关注 projects。
- 全部用中文。`

/** 读取系统实时状态快照 */
async function collectSnapshot(): Promise<HermesSystemSnapshot> {
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000)
  const [pendingProposals, logs, atRiskCount] = await Promise.all([
    prisma.harnessProposal.count({ where: { status: "pending" } }),
    prisma.agentLog.findMany({
      where: { createdAt: { gte: since } },
      select: { status: true },
    }),
    prisma.project.count({ where: { status: "at-risk" } }),
  ])

  const total = logs.length
  const errors = logs.filter((l) => isErrorStatus(l.status)).length
  const errorRate = total > 0 ? Math.round((errors / total) * 100) : 0

  return { pendingProposals, errorRate, atRiskCount, logCount24h: total }
}

/** 构造用户提示词（含当前时间与系统状态） */
function buildUserPrompt(snapshot: HermesSystemSnapshot): string {
  const now = new Date().toLocaleString("zh-CN")
  return `当前时间是 ${now}。
基于以下系统状态，生成 ${TARGET_COUNT} 条今日工作建议：

系统状态：
- 待审批 Harness 提案：${snapshot.pendingProposals} 条
- 24 小时内智能体错误率：${snapshot.errorRate}%（共 ${snapshot.logCount24h} 条运行日志）
- 风险中项目数量：${snapshot.atRiskCount} 个`
}

/** 归一化优先级 */
function normalizePriority(value: unknown): SuggestionPriority {
  const v = String(value ?? "").toLowerCase().trim()
  if (v === "high" || v === "高") return "high"
  if (v === "low" || v === "低") return "low"
  return "mid"
}

/** 归一化关联模块 */
function normalizeRelatedTo(value: unknown): SuggestionRelatedTo {
  const v = String(value ?? "").toLowerCase().trim()
  if (v === "projects" || v === "project") return "projects"
  if (v === "harness") return "harness"
  return "agents"
}

/** 校验并收窄 AI 返回的建议数组 */
function validateSuggestions(raw: unknown): HermesSuggestion[] {
  const obj = (raw ?? {}) as Record<string, unknown>
  const list = Array.isArray(obj.suggestions) ? obj.suggestions : []
  const suggestions = list
    .map((item) => {
      const s = (item ?? {}) as Record<string, unknown>
      const title = String(s.title ?? "").trim()
      const action = String(s.action ?? "").trim()
      if (!title || !action) return null
      return {
        priority: normalizePriority(s.priority),
        title,
        action,
        relatedTo: normalizeRelatedTo(s.relatedTo),
      } satisfies HermesSuggestion
    })
    .filter((s): s is HermesSuggestion => s !== null)
    .slice(0, TARGET_COUNT)

  if (suggestions.length === 0) {
    throw new Error("AI 未返回任何有效建议")
  }
  return suggestions
}

/** LLM 不可用时的预设建议降级方案 */
function fallbackSuggestions(snapshot: HermesSystemSnapshot): HermesSuggestion[] {
  const suggestions: HermesSuggestion[] = [
    {
      priority: "high",
      title: "处理待跟进询盘",
      action: "帮我列出所有未回复的高优先级询盘，并按紧急程度排序",
      relatedTo: "agents",
    },
    {
      priority: "mid",
      title: "检查市场情报",
      action: "帮我分析最近的汇率和关税变化对现有报价的影响",
      relatedTo: "projects",
    },
    {
      priority: "low",
      title: "审查 Harness 提案",
      action: "帮我查看当前待审批的 Harness 升级提案",
      relatedTo: "harness",
    },
  ];

  if (snapshot.pendingProposals > 0) {
    suggestions[0] = {
      priority: "high",
      title: "审批 Harness 升级提案",
      action: `当前有 ${snapshot.pendingProposals} 条待审批提案，建议尽快审查`,
      relatedTo: "harness",
    };
  }
  if (snapshot.atRiskCount > 0) {
    suggestions[1] = {
      priority: "high",
      title: "关注风险项目",
      action: `当前有 ${snapshot.atRiskCount} 个项目处于风险状态，建议立即评估`,
      relatedTo: "projects",
    };
  }

  return suggestions;
}

/**
 * 通过共享 llm-provider 调用 Anthropic 结构化输出生成建议。
 * 🔄 消除直接 import anthropic SDK（P1 整改）。
 */
async function generateWithAnthropic(
  prompt: string,
  model: string,
): Promise<{ suggestions: HermesSuggestion[]; model: string }> {
  const raw = await callAnthropicStructured({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: prompt,
    schema: SUGGESTIONS_SCHEMA as Record<string, unknown>,
    model,
    maxTokens: 2048,
  })
  return {
    suggestions: validateSuggestions(raw),
    model,
  }
}

/**
 * 通过共享 llm-provider 调用 DeepSeek JSON 模式生成建议。
 * 🔄 消除手写 fetch（P1 整改）。
 */
async function generateWithDeepSeek(
  prompt: string,
  model: string,
): Promise<{ suggestions: HermesSuggestion[]; model: string }> {
  const raw = await callDeepSeekJson({
    systemPrompt: `${SYSTEM_PROMPT}

只输出一个 JSON 对象，不要任何额外文字或 Markdown 包裹，格式如下：
{
  "suggestions": [
    { "priority": "high|mid|low", "title": "建议标题", "action": "具体行动", "relatedTo": "agents|projects|harness" }
  ]
}`,
    userPrompt: prompt,
    model,
    maxTokens: 1024,
    temperature: 0.5,
  })
  return {
    suggestions: validateSuggestions(raw),
    model,
  }
}

/**
 * 生成 Hermes 今日建议。
 *
 * §4.12 策略路由：经 selectModel() 决策 Provider/Model（禁止自行选择 Provider），
 * 决策自动写入 AuditLog(action='model.route')。
 *
 * LLM 不可用时返回基于系统快照的预设建议。
 */
export async function generateHermesSuggestions(): Promise<HermesSuggestionsResult> {
  const snapshot = await collectSnapshot()
  const prompt = buildUserPrompt(snapshot)

  // LLM 不可用时返回基于系统快照的预设建议
  if (!isProviderAvailable("anthropic") && !isProviderAvailable("deepseek")) {
    return {
      suggestions: fallbackSuggestions(snapshot),
      snapshot,
      provider: "deepseek",
      model: "fallback",
    }
  }

  // §4.12 策略路由：经 selectModel() 决策并自动写入 AuditLog
  const routing = await selectModel({
    taskType: "analysis",
    riskLevel: "low",
    estimatedTokens: Math.ceil((SYSTEM_PROMPT.length + prompt.length) / 4),
    workspaceId: "default",
  })

  let generated: { suggestions: HermesSuggestion[]; model: string }

  if (routing.provider === "anthropic") {
    generated = await generateWithAnthropic(prompt, routing.model)
  } else {
    generated = await generateWithDeepSeek(prompt, routing.model)
  }

  return {
    suggestions: generated.suggestions,
    snapshot,
    provider: routing.provider,
    model: generated.model,
  }
}

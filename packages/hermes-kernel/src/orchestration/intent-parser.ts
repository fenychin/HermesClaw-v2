import type { TaskEnvelope } from "@hermesclaw/event-contracts"

export interface IntentParseInput {
  rawText: string
  workspaceId: string
  userId: string
  agentId?: string
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
}

export interface IntentParseResult {
  taskName: string
  goal: string
  suggestedWorkflowIds: string[]
  requiredSkills: string[]
  cannotDoReasons: string[]
  envelopeOverrides?: Partial<TaskEnvelope>
}

const INTENT_SYSTEM_PROMPT = `你是一个智能意图解析器，负责将用户的自然语言指令解析为结构化任务信息。
请严格输出以下 JSON 格式（不要包含 Markdown 代码块标记，仅输出纯 JSON）：

{
  "taskName": "简短的任务名称标识，如 handle-inquiry / generate-quotation / send-email",
  "goal": "任务的详细目标描述（中文）",
  "suggestedWorkflowIds": ["匹配的工作流 ID 列表，可为空"],
  "requiredSkills": ["完成任务所需的技能名称列表，可为空"]
}`

function toKeywords(rule: string): string[] {
  return rule
    .split(/[\s,，、；;。./（）()]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
}

function parseJsonFromLlm(raw: string): Record<string, unknown> | null {
  if (!raw) return null

  const trimmed = raw.trim()
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch {
      /* fallthrough */
    }
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    /* fallthrough */
  }

  const firstBrace = trimmed.indexOf("{")
  const lastBrace = trimmed.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
    } catch {
      /* fallthrough */
    }
  }

  return null
}

export async function parseIntent(
  input: IntentParseInput,
  deps: {
    callLlm: (system: string, user: string) => Promise<string>
    prisma: any
  },
): Promise<IntentParseResult> {
  const { rawText, workspaceId, agentId } = input

  const cannotDoReasons: string[] = []

  if (agentId) {
    try {
      const agent = await deps.prisma.agent.findUnique({
        where: { id: agentId, workspaceId },
        select: { cannotDo: true },
      })
      if (agent?.cannotDo) {
        let rules: string[] = []
        try {
          rules = JSON.parse(agent.cannotDo)
        } catch {
          rules = [agent.cannotDo]
        }
        if (!Array.isArray(rules)) rules = [agent.cannotDo]

        for (const rule of rules) {
          const keywords = toKeywords(rule)
          const text = rawText.toLowerCase()
          if (keywords.some((k) => text.includes(k.toLowerCase()))) {
            cannotDoReasons.push(rule)
          }
        }
      }
    } catch {
      /* 静默降级 */
    }
  }

  const userPrompt = `用户指令：${rawText}
${
  input.conversationHistory && input.conversationHistory.length > 0
    ? `对话历史：\n${input.conversationHistory
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n")}`
    : ""
}`

  let parsed: Record<string, unknown> | null = null
  try {
    const llmRaw = await deps.callLlm(INTENT_SYSTEM_PROMPT, userPrompt)
    parsed = parseJsonFromLlm(llmRaw)
  } catch {
    /* LLM 调用失败，走 fallback */
  }

  if (parsed && typeof parsed.taskName === "string" && typeof parsed.goal === "string") {
    return {
      taskName: parsed.taskName as string,
      goal: parsed.goal as string,
      suggestedWorkflowIds: Array.isArray(parsed.suggestedWorkflowIds)
        ? (parsed.suggestedWorkflowIds as string[])
        : [],
      requiredSkills: Array.isArray(parsed.requiredSkills)
        ? (parsed.requiredSkills as string[])
        : [],
      cannotDoReasons,
      envelopeOverrides: cannotDoReasons.length > 0 ? ({ blocked: true } as any) : undefined,
    }
  }

  return {
    taskName: "unknown",
    goal: rawText,
    suggestedWorkflowIds: [],
    requiredSkills: [],
    cannotDoReasons,
    envelopeOverrides: cannotDoReasons.length > 0 ? ({ blocked: true } as any) : undefined,
  }
}

/**
 * POST /api/harness/generate-spec —— AI 生成 Harness Spec（AGENTS.md P6 Spec-First）
 *
 * 接收业务意图、行业、智能体角色，调用 AI 生成结构化的 Harness Spec 文档。
 *
 * Provider 策略（与 harness-llm.ts 一致）：
 *   1. HARNESS_LLM_PROVIDER 显式覆盖
 *   2. ANTHROPIC_API_KEY → 用 Anthropic claude-haiku-4-5（成本优先，Spec 生成非关键路径）
 *   3. DEEPSEEK_API_KEY → 回退 DeepSeek
 *
 * 请求体：{ businessIntent: string, industry: string, agentRole: string }
 * 响应：{ spec: HarnessSpec（JSON）, markdown: string }
 */
import anthropic from "@/lib/anthropic"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"
import { rateLimit } from "@/lib/rate-limit"
import { HarnessSpecGenerateSchema, validateBody } from "@/lib/validators"

export const runtime = "nodejs"
// AI 调用可能稍慢
export const maxDuration = 60

/** Harness Spec JSON 结构 */
interface HarnessSpec {
  specVersion: string
  agentRole: string
  taskBoundary: {
    canDo: string[]
    needApproval: string[]
    forbidden: string[]
  }
  contextRequirements: string[]
  toolPermissions: {
    tool: string
    permission: "read" | "write" | "execute"
    level: "L1" | "L2" | "L3" | "L4"
  }[]
  guardrails: {
    rule: string
    action: string
  }[]
  feedbackLoop: {
    successMetric: string
    failureCondition: string
    evolutionTrigger: string
  }
}

/** 生成请求体 */
interface GenerateSpecRequest {
  businessIntent: string
  industry: string
  agentRole: string
}

// ---- AI 模型选择 ----
const ANTHROPIC_MODEL = "claude-haiku-4-5" // ▲ 成本优先（用户指定）
const DEEPSEEK_MODEL = "deepseek-chat"

const SYSTEM_PROMPT = `你是 HermesClaw-v2 的 Harness Spec 生成引擎。
你的职责是把业务意图转化为结构化的 Harness Spec 文档。
Harness Spec 是 Agent 行为边界的完整描述，包括：任务边界、上下文要求、工具权限、安全护栏、L1-L4 授权级别。

AGENTS.md 定义的四级授权（L1–L4）：
- L1：全自动执行，无需审批
- L2：建议执行（默认），可自动执行但留痕，事后可审查
- L3：需人工确认，高风险操作必须人工二次确认后才执行
- L4：绝对禁止自动，系统永不自动执行；必须由人工在源业务系统发起

重要约束：
- L4 是绝对禁止级，不派发任何 toolPermissions。对应 forbidden 列表。
- L3 用于审批级权限（如：删除数据、修改配置、发送外部通知）。对应 needApproval + toolPermissions 的 write/execute。
- L2 用于日常读写但需留痕（如：读取数据库、调用第三方API查询）。
- L1 仅用于纯只读查询（如：读取自身配置、查询文档）。
- canDo 列出的只能是 L1/L2 级别；needApproval 列出的是 L3；forbidden 列出的是 L4。
- 所有文本用中文，工具名用英文。`

function buildUserPrompt(input: GenerateSpecRequest): string {
  return `业务意图：${input.businessIntent}
行业：${input.industry}
智能体角色：${input.agentRole}

请生成一份完整的 Harness Spec，格式如下（JSON）：
{
  "specVersion": "v1.0",
  "agentRole": "${input.agentRole}",
  "taskBoundary": {
    "canDo": ["可以做的事（L1/L2级别）"],
    "needApproval": ["需要审批的事（L3级别）"],
    "forbidden": ["绝对禁止的事（L4级别）"]
  },
  "contextRequirements": ["需要哪些上下文信息（如：企业产品库、客户历史、行业术语等）"],
  "toolPermissions": [
    { "tool": "工具名（英文）", "permission": "read|write|execute", "level": "L1|L2|L3" }
  ],
  "guardrails": [
    { "rule": "安全规则描述", "action": "违规时的处理方式" }
  ],
  "feedbackLoop": {
    "successMetric": "衡量任务成功的指标",
    "failureCondition": "判定失败的触发条件",
    "evolutionTrigger": "触发 Harness 进化的条件（如连续失败N次）"
  }
}

请严格输出一个 JSON 对象，不要任何额外文字或 Markdown 包裹。`
}

/** 将 HarnessSpec + 输入参数 渲染为 Markdown 文档 */
function renderSpecMarkdown(
  spec: HarnessSpec,
  input: GenerateSpecRequest,
): string {
  const lines: string[] = [
    `# Harness Spec — ${spec.agentRole}`,
    "",
    `> **版本**: ${spec.specVersion}`,
    `> **行业**: ${input.industry}`,
    `> **角色**: ${spec.agentRole}`,
    `> **生成时间**: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    `> **生成引擎**: HermesClaw-v2 Harness Spec Generator`,
    "",
    "---",
    "",
    "## 1. 任务边界（Task Boundary）",
    "",
    "### ✅ 可以执行（L1 / L2）",
    ...spec.taskBoundary.canDo.map((item) => `- ${item}`),
    "",
    "### ⚠️ 需要审批（L3）",
    ...spec.taskBoundary.needApproval.map((item) => `- ${item}`),
    "",
    "### ❌ 绝对禁止（L4）",
    ...spec.taskBoundary.forbidden.map((item) => `- ${item}`),
    "",
    "---",
    "",
    "## 2. 上下文要求（Context Requirements）",
    ...spec.contextRequirements.map((item) => `- ${item}`),
    "",
    "---",
    "",
    "## 3. 工具权限（Tool Permissions）",
    "",
    "| 工具 | 权限 | 授权等级 |",
    "|------|------|----------|",
    ...spec.toolPermissions.map(
      (tp) => `| \`${tp.tool}\` | ${tp.permission} | ${tp.level} |`,
    ),
    "",
    "---",
    "",
    "## 4. 安全护栏（Guardrails）",
    ...spec.guardrails.map(
      (g) => `- **规则**: ${g.rule}\n  **违规处理**: ${g.action}`,
    ),
    "",
    "---",
    "",
    "## 5. 反馈闭环（Feedback Loop）",
    "",
    `- **成功指标**: ${spec.feedbackLoop.successMetric}`,
    `- **失败条件**: ${spec.feedbackLoop.failureCondition}`,
    `- **进化触发**: ${spec.feedbackLoop.evolutionTrigger}`,
    "",
    "---",
    "",
    `*此 Spec 由 HermesClaw-v2 的 AI Harness Spec 生成引擎自动生成，` +
      `符合 AGENTS.md P6 Spec-First 原则。创建智能体时将以此 Spec 作为初始 Harness 配置基线。*`,
  ]
  return lines.join("\n")
}

/** 从 AI 原始输出中解析 JSON（兼容 ```json / 裸 JSON） */
function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf("{")
    const end = candidate.lastIndexOf("}")
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1))
    }
    throw new Error("无法从模型输出中解析 JSON")
  }
}

/** 校验 AI 返回，收窄为 HarnessSpec */
function validateSpec(raw: unknown, input: GenerateSpecRequest): HarnessSpec {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI 返回结果不是合法对象")
  }
  const obj = raw as Record<string, unknown>

  const taskBoundary = (obj.taskBoundary as Record<string, unknown>) ?? {}
  const toolPermissions = Array.isArray(obj.toolPermissions)
    ? obj.toolPermissions.map((tp: unknown) => {
        const t = tp as Record<string, unknown>
        return {
          tool: String(t.tool ?? "unknown"),
          permission: (["read", "write", "execute"].includes(
            String(t.permission ?? ""),
          )
            ? String(t.permission)
            : "read") as "read" | "write" | "execute",
          level: (["L1", "L2", "L3", "L4"].includes(String(t.level ?? ""))
            ? String(t.level)
            : "L2") as "L1" | "L2" | "L3" | "L4",
        }
      })
    : []

  const guardrails = Array.isArray(obj.guardrails)
    ? obj.guardrails.map((g: unknown) => {
        const gg = g as Record<string, unknown>
        return {
          rule: String(gg.rule ?? ""),
          action: String(gg.action ?? "记录日志并由人工审核"),
        }
      })
    : []

  const feedbackLoop = (obj.feedbackLoop as Record<string, unknown>) ?? {}

  return {
    specVersion: String(obj.specVersion ?? "v1.0"),
    agentRole: String(obj.agentRole ?? input.agentRole),
    taskBoundary: {
      canDo: Array.isArray(taskBoundary.canDo)
        ? taskBoundary.canDo.map(String)
        : [],
      needApproval: Array.isArray(taskBoundary.needApproval)
        ? taskBoundary.needApproval.map(String)
        : [],
      forbidden: Array.isArray(taskBoundary.forbidden)
        ? taskBoundary.forbidden.map(String)
        : [],
    },
    contextRequirements: Array.isArray(obj.contextRequirements)
      ? obj.contextRequirements.map(String)
      : [],
    toolPermissions,
    guardrails,
    feedbackLoop: {
      successMetric: String(
        feedbackLoop.successMetric ?? "任务完成率达到 95% 以上",
      ),
      failureCondition: String(
        feedbackLoop.failureCondition ?? "连续 3 次任务失败",
      ),
      evolutionTrigger: String(
        feedbackLoop.evolutionTrigger ??
          "连续 3 次同类任务失败或工具调用成功率低于 85%",
      ),
    },
  }
}

/** Anthropic 路径：claude-haiku-4-5 + 结构化输出 */
async function generateWithAnthropic(
  userPrompt: string,
): Promise<{ spec: HarnessSpec; provider: string; model: string }> {
  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic 未返回文本内容")
  }

  return {
    spec: parseJsonLoose(textBlock.text) as HarnessSpec,
    provider: "anthropic",
    model: ANTHROPIC_MODEL,
  }
}

/** DeepSeek 路径：兜底生成 */
async function generateWithDeepSeek(
  userPrompt: string,
): Promise<{ spec: HarnessSpec; provider: string; model: string }> {
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
      max_tokens: 4096,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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

  return {
    spec: parseJsonLoose(content) as HarnessSpec,
    provider: "deepseek",
    model: DEEPSEEK_MODEL,
  }
}

/** POST /api/harness/generate-spec */
export async function POST(request: Request) {
  try {
    // 频率限制：每分钟最多 10 次（AI 调用成本高）
    const ip = request.headers.get("x-forwarded-for") || "unknown"
    if (!rateLimit(ip, 10, 60_000)) {
      return Response.json(
        { success: false, error: "请求过于频繁，请稍后重试" },
        { status: 429 },
      )
    }

    // 1. 解析请求体（Zod 验证）
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, HarnessSpecGenerateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    // 2. Provider 选择（与 harness-llm.ts 一致的策略）
    const override = process.env.HARNESS_LLM_PROVIDER?.toLowerCase().trim()
    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim())
    const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY?.trim())

    const userPrompt = buildUserPrompt(body)

    let result: { spec: unknown; provider: string; model: string }

    if (override === "deepseek") {
      if (!hasDeepSeek)
        return errorResponse("HARNESS_LLM_PROVIDER=deepseek 但未配置 DEEPSEEK_API_KEY", 502)
      result = await generateWithDeepSeek(userPrompt)
    } else if (override === "anthropic") {
      if (!hasAnthropic)
        return errorResponse("HARNESS_LLM_PROVIDER=anthropic 但未配置 ANTHROPIC_API_KEY", 502)
      result = await generateWithAnthropic(userPrompt)
    } else if (hasAnthropic) {
      result = await generateWithAnthropic(userPrompt)
    } else if (hasDeepSeek) {
      result = await generateWithDeepSeek(userPrompt)
    } else {
      return errorResponse(
        "未配置 ANTHROPIC_API_KEY 或 DEEPSEEK_API_KEY，无法生成 Harness Spec",
        502,
      )
    }

    // 3. 校验 + 序列化
    const spec = validateSpec(result.spec, body)
    const markdown = renderSpecMarkdown(spec, body)

    return successResponse({
      spec,
      markdown,
      provider: result.provider,
      model: result.model,
    })
  } catch (error) {
    logger.error('POST /api/harness/generate-spec: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    const message = error instanceof Error ? error.message : "未知错误"
    return errorResponse(`Harness Spec 生成失败：${message}`, 502)
  }
}

/**
 * 任务边界运行时强制（AGENTS.md 第四章 4.1 / 第五章 A7）
 *
 * —— 智能体执行任务前，比对请求动作与其 cannotDo 清单；命中即拒绝执行，
 *    不绕过 Harness。与 P0-③「边界变更需二次确认」形成「变更受控 + 运行时强制」闭环。
 *
 * 判定策略（务实，先关键词/规则匹配，LLM 语义判定留作后续增强）：
 *   - 将 cannotDo 每条拆为关键词，若动作文本命中任一关键词 → 越界。
 *   - 同时内置一批高危动作词（删除生产数据、绕过审批等）作为兜底红线。
 */
import { prisma } from "@/lib/prisma"
import { parseJsonField } from "@/lib/api-utils"
import { logger } from "@/lib/logger"
import { enforceBoundary } from "@hermesclaw/hermes-kernel"
import {
  resolveLlmProvider,
  callAnthropicStructured,
  callDeepSeekJson,
} from "./llm-provider"

/** 兜底红线关键词：无论 cannotDo 是否声明，命中即视为越界 */
const HARD_REDLINES = [
  "删除生产",
  "drop table",
  "rm -rf",
  "绕过审批",
  "绕过合规",
  "未经审核",
  "未经审批",
]

export interface BoundaryCheckResult {
  /** 是否允许执行 */
  allowed: boolean
  /** 越界时命中的边界条目或红线 */
  violation?: string
}

/** 从一条 cannotDo 文本提取可匹配的关键词（去标点、按分隔切分、保留 ≥2 字片段） */
function toKeywords(rule: string): string[] {
  return rule
    .split(/[\s,，、；;。./（）()]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
}

/**
 * 校验某动作是否在智能体边界内。
 * @param agentId     智能体 ID
 * @param action      本次请求的动作描述（自然语言）
 * @param workspaceId 工作空间 ID（AGENTS.md §4.11 多租户隔离），默认 "default"
 */
export async function assertWithinBoundary(
  agentId: string,
  action: string,
  workspaceId: string,
  opts?: { prisma?: typeof prisma },
): Promise<BoundaryCheckResult> {
  const text = action.toLowerCase()
  const client = opts?.prisma || prisma

  // 1. 兜底红线（第一级：硬匹配）
  for (const red of HARD_REDLINES) {
    if (text.includes(red.toLowerCase())) {
      return { allowed: false, violation: `触发高危红线：${red}` }
    }
  }

  // 2. 检查 Workspace 边界（下沉到 kernel）
  const boundary = await enforceBoundary({
    agentId,
    workspaceId,
    targetWorkspaceId: workspaceId,
    prisma: client,
  })
  if (!boundary.allowed) {
    return { allowed: false, violation: boundary.violation! }
  }

  // 3. 读取该 agent 的 cannotDo（workspaceId 隔离）
  const agent = await client.agent.findUnique({
    where: { id: agentId, workspaceId },
    select: { cannotDo: true },
  })
  if (!agent) {
    return { allowed: false, violation: "智能体不存在，拒绝执行" }
  }

  const cannotDo = parseJsonField<string[]>(agent.cannotDo, [])
  for (const rule of cannotDo) {
    const keywords = toKeywords(rule)
    // 整条命中（动作文本包含完整规则）直接判越界
    if (text.includes(rule.toLowerCase())) {
      return { allowed: false, violation: rule }
    }
    // 关键词命中 ≥2 个视为越界（降低单字误伤）
    const hit = keywords.filter((k) => text.includes(k.toLowerCase()))
    if (hit.length >= 2) {
      return { allowed: false, violation: rule }
    }
  }

  // 4. 第二级拦截：LLM 语义判定（解决同义词语义绕过及模糊表达的精准控制）
  // NOTE: 如果 cannotDo 列表为空，且未触发高危红线硬过滤，则可以直接放行（无需调用 LLM）。
  if (cannotDo.length === 0) {
    return { allowed: true }
  }

  try {
    const { provider, model } = resolveLlmProvider()

    const boundaryResponseSchema = {
      type: "object",
      properties: {
        allowed: {
          type: "boolean",
          description: "是否允许执行该动作。如果动作在语义上违反了禁止行为清单（cannotDo）中的任何一条，或者属于全局高危红线，则为 false；否则为 true。"
        },
        violation: {
          type: "string",
          description: "如果 allowed 为 false，这里必须填写被违反的禁止行为清单（cannotDo）中的原文本条目（不允许自行改写）或者触犯的高危红线原因。如果 allowed 为 true，则为 null。"
        }
      },
      required: ["allowed", "violation"]
    }

    const systemPrompt = `你是一个智能安全护栏（Security Guardrail），负责评估智能体（Agent）计划执行的动作是否在允许的业务边界内。

你需要评估给定的【待评估动作】是否违反了给定的【禁止行为清单（cannotDo）】中的任意一条，或者触犯了【全局高危红线（Hard Redlines）】。

判定原则：
1. 【语义拦截】：如果【待评估动作】在语义上与【禁止行为清单（cannotDo）】中的某条规则是同义的，或者包含类似的高风险意图（例如通过改变句式或修改词汇避开了关键词匹配），必须判定为越界（allowed = false）。
2. 【红线判定】：若【待评估动作】包含或者指示了【全局高危红线（Hard Redlines）】（如删除生产数据库、绕过合规审批等高危行为），必须判定为越界（allowed = false）。
3. 如果动作在允许范围内且不违反任何规则，则判定为允许（allowed = true）。

输出格式：
你必须返回符合 JSON Schema 的 JSON 对象：
{
  "allowed": boolean, // 是否允许执行
  "violation": string | null // 如果 allowed 为 false，给出被违反的 cannotDo 条款原文本（必须是 cannotDo 列表中某项一模一样的原句）或高危红线说明。如果 allowed 为 true，则为 null。
}`

    const userPrompt = `【待评估动作】：
"${action}"

【禁止行为清单（cannotDo）】：
${cannotDo.map((rule, idx) => `${idx + 1}. ${rule}`).join("\n")}

【全局高危红线（Hard Redlines）】：
${HARD_REDLINES.map((red, idx) => `${idx + 1}. ${red}`).join("\n")}

请对以上动作进行深入的语义分析，确定其是否属于被禁止行为，并返回 JSON 结果。`

    interface LlmBoundaryResponse {
      allowed: boolean
      violation: string | null
    }

    let llmResult: LlmBoundaryResponse
    if (provider === "anthropic") {
      llmResult = (await callAnthropicStructured({
        systemPrompt,
        userPrompt,
        schema: boundaryResponseSchema,
        model,
      })) as LlmBoundaryResponse
    } else {
      llmResult = (await callDeepSeekJson({
        systemPrompt,
        userPrompt: `${userPrompt}\n\n请返回 JSON 格式，严格包含 allowed 和 violation 字段。`,
        model,
      })) as LlmBoundaryResponse
    }

    if (llmResult && typeof llmResult.allowed === "boolean") {
      const allowed = llmResult.allowed
      const violation = allowed ? undefined : (llmResult.violation || "违反任务边界（语义拦截）")
      return { allowed, violation }
    }
  } catch (error: any) {
    // NOTE: 防爆降级。
    // 当没有配置大模型 API Key，或者 LLM 接口调用超时/失败时，记录警告日志，
    // 并采用第一级硬过滤的放行判定结果，避免因安全层失效导致主流程阻断。
    logger.warn(`[Boundary LLM Check Failed] 二级 LLM 语义判定失败，安全降级至一级硬过滤放行结果。`, {
      agentId,
      action,
      error: error.message || error,
    })
  }

  return { allowed: true }
}

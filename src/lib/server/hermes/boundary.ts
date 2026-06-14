/**
 * 任务边界运行时强制（AGENTS.md 第四章 4.1 / 第五章 A7）
 *
 * —— 智能体执行任务前，比对请求动作与其 cannotDo 清单；命中即拒绝执行，
 *    不绕过 Harness。与 P0-③「边界变更需二次确认」形成「变更受控 + 运行时强制」闭环。
 *
 * 判定策略（CLAUDE.md §8 + 全局架构审查 P2-#8）：
 *   1. HARD_REDLINES 兜底红线 → fail-closed（source: hard-redline）
 *   2. 关键词命中 → fail-closed（source: keyword，短路加速器）
 *   3. LLM 二级语义判定 → 主路径（source: llm）
 *   4. LLM 调用失败/超时 → fail-closed（source: llm-fail-closed，安全优先）
 *
 * 所有决策返回 BoundaryDecision 契约对象，写入 AuditLog（boundary.check）。
 */

import { prisma } from "@/lib/prisma"
import { parseJsonField } from "@/lib/api-utils"
import { logger } from "@/lib/logger"
import {
  resolveLlmProvider,
  callAnthropicStructured,
  callDeepSeekJson,
} from "@/lib/server/shared/llm-provider"
import { writeAuditLog, actorFromSession } from "@/lib/server/shared/audit"
import { type BoundaryDecision } from "@/contracts"
import { CONTRACT_VERSION } from "@/contracts"

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

// 向后兼容旧接口
export interface BoundaryCheckResult {
  allowed: boolean
  violation?: string
}

/** 从一条 cannotDo 文本提取可匹配的关键词（去标点、按分隔切分、保留 ≥2 字片段） */
function toKeywords(rule: string): string[] {
  return rule
    .split(/[\s,，、；;。./（）()]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
}

/** LLM 语义判定 schema（与 boundary-decision 契约对齐） */
const boundaryLlmSchema = {
  type: "object",
  properties: {
    allowed: {
      type: "boolean",
      description: "是否允许执行该动作。如果动作在语义上违反了禁止行为清单（cannotDo）中的任何一条，或者属于全局高危红线，则为 false；否则为 true。",
    },
    reason: {
      type: "string",
      description: "简短说明决策理由（≤200字）。如果 allowed 为 false，必须引用被违反的 cannotDo 条目原文本或高危红线。",
    },
  },
  required: ["allowed", "reason"],
}

/**
 * 校验某动作是否在智能体边界内。
 *
 * 决策顺序（四级）：
 *   1. hard-redline  → fail-closed
 *   2. keyword       → fail-closed（短路）
 *   3. LLM 语义判定   → 主路径
 *   4. LLM fail      → fail-closed（安全优先，取代旧版的 fail-open 降级）
 *
 * @param agentId     智能体 ID
 * @param action      本次请求的动作描述（自然语言）
 * @param workspaceId 工作空间 ID（AGENTS.md §4.11 多租户隔离）
 */
export async function assertWithinBoundary(
  agentId: string,
  action: string,
  workspaceId: string,
  opts?: { prisma?: typeof prisma },
): Promise<BoundaryDecision> {
  const text = action.toLowerCase()
  const client = opts?.prisma || prisma
  const startTime = Date.now()

  // ── 1. 兜底红线（第一级：硬匹配，source: hard-redline） ──
  for (const red of HARD_REDLINES) {
    if (text.includes(red.toLowerCase())) {
      const decision: BoundaryDecision = {
        allowed: false,
        source: "hard-redline",
        reason: `触发高危红线：${red}`,
        matchedRule: red,
        version: CONTRACT_VERSION,
      }
      await auditBoundaryCheck(agentId, action, workspaceId, decision).catch(() => {})
      return decision
    }
  }

  // ── 2. 关键词匹配（第二级：短路加速器，source: keyword） ──
  const agent = await client.agent.findUnique({
    where: { id: agentId, workspaceId },
    select: { cannotDo: true },
  })
  if (!agent) {
    const decision: BoundaryDecision = {
      allowed: false,
      source: "hard-redline",
      reason: "智能体不存在，拒绝执行",
      matchedRule: "agent-not-found",
      version: CONTRACT_VERSION,
    }
    await auditBoundaryCheck(agentId, action, workspaceId, decision).catch(() => {})
    return decision
  }

  const cannotDo = parseJsonField<string[]>(agent.cannotDo, [])
  const matchedKeywords: string[] = []

  for (const rule of cannotDo) {
    const keywords = toKeywords(rule)
    if (text.includes(rule.toLowerCase())) {
      const decision: BoundaryDecision = {
        allowed: false,
        source: "keyword",
        reason: `命中禁止规则：${rule}`,
        matchedRule: rule,
        version: CONTRACT_VERSION,
      }
      await auditBoundaryCheck(agentId, action, workspaceId, decision).catch(() => {})
      return decision
    }
    const hit = keywords.filter((k) => text.includes(k.toLowerCase()))
    if (hit.length >= 2) {
      matchedKeywords.push(...hit)
    }
  }

  if (matchedKeywords.length >= 2) {
    const decision: BoundaryDecision = {
      allowed: false,
      source: "keyword",
      reason: `命中关键词（≥2）：${matchedKeywords.join(", ")}`,
      matchedRule: cannotDo.find((r) => {
        const kw = toKeywords(r)
        return kw.filter((k) => matchedKeywords.includes(k)).length >= 2
      }) ?? matchedKeywords.join(", "),
      version: CONTRACT_VERSION,
    }
    await auditBoundaryCheck(agentId, action, workspaceId, decision).catch(() => {})
    return decision
  }

  // cannotDo 为空且无红线触发 → 直接放行，无需 LLM 判定
  if (cannotDo.length === 0) {
    const decision: BoundaryDecision = {
      allowed: true,
      source: "keyword",
      reason: "cannotDo 清单为空，仅红线硬过滤通过",
      version: CONTRACT_VERSION,
    }
    return decision
  }

  // ── 3. LLM 语义判定（第三级：主路径，source: llm） ──
  try {
    const { provider, model } = resolveLlmProvider()

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
  "reason": string    // 简短说明（≤200字）。如果 allowed 为 false，必须引用被违反的 cannotDo 条目原文本或高危红线
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
      reason: string
    }

    let llmResult: LlmBoundaryResponse
    if (provider === "anthropic") {
      llmResult = (await callAnthropicStructured({
        systemPrompt,
        userPrompt,
        schema: boundaryLlmSchema,
        model,
      })) as LlmBoundaryResponse
    } else {
      llmResult = (await callDeepSeekJson({
        systemPrompt,
        userPrompt: `${userPrompt}\n\n请返回 JSON 格式，严格包含 allowed 和 reason 字段。`,
        model,
      })) as LlmBoundaryResponse
    }

    if (llmResult && typeof llmResult.allowed === "boolean") {
      const latencyMs = Date.now() - startTime
      const decision: BoundaryDecision = {
        allowed: llmResult.allowed,
        source: "llm",
        reason: llmResult.reason || (llmResult.allowed ? "LLM 语义判定通过" : "LLM 语义判定拒绝"),
        llmProvider: provider,
        latencyMs,
        version: CONTRACT_VERSION,
      }
      await auditBoundaryCheck(agentId, action, workspaceId, decision).catch(() => {})
      return decision
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : "未知错误"
    logger.warn(`[Boundary LLM Check Failed] 二级 LLM 语义判定失败 → fail-closed`, {
      agentId,
      action,
      error: errMsg,
    })

    // ── 4. LLM 失败/超时 → fail-closed（安全优先，不再 fail-open） ──
    const decision: BoundaryDecision = {
      allowed: false,
      source: "llm-fail-closed",
      reason: `LLM 二级语义判定失败（${errMsg.slice(0, 100)}），安全关闭拒绝执行`,
      latencyMs: Date.now() - startTime,
      version: CONTRACT_VERSION,
    }
    await auditBoundaryCheck(agentId, action, workspaceId, decision).catch(() => {})
    return decision
  }

  // 理论上不可达（LLM 调用无异常但返回数据格式异常），保守拒绝
  const decision: BoundaryDecision = {
    allowed: false,
    source: "llm-fail-closed",
    reason: "LLM 返回数据格式异常，安全关闭拒绝执行",
    latencyMs: Date.now() - startTime,
    version: CONTRACT_VERSION,
  }
  await auditBoundaryCheck(agentId, action, workspaceId, decision).catch(() => {})
  return decision
}

/**
 * 记录 Boundary 决策到 AuditLog（action: boundary.check）。
 */
async function auditBoundaryCheck(
  agentId: string,
  action: string,
  decision: BoundaryDecision,
  workspaceId?: string,
) {
  try {
    const actor = await actorFromSession()
    await writeAuditLog({
      actor,
      action: "boundary.check",
      targetType: "agent",
      targetId: agentId,
      detail: `边界检查：${decision.allowed ? "放行" : "拒绝"}（source: ${decision.source}）\n理由: ${decision.reason}\n原始动作: ${action.slice(0, 200)}`,
      riskLevel: decision.allowed ? "low" : "high",
      workspaceId: workspaceId ?? "default",
    })
  } catch {
    // 审计失败不阻断主流程
  }
}

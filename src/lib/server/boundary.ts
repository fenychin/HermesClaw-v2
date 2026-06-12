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
  workspaceId = "default",
): Promise<BoundaryCheckResult> {
  const text = action.toLowerCase()

  // 1. 兜底红线
  for (const red of HARD_REDLINES) {
    if (text.includes(red.toLowerCase())) {
      return { allowed: false, violation: `触发高危红线：${red}` }
    }
  }

  // 2. 读取该 agent 的 cannotDo（workspaceId 隔离）
  const agent = await prisma.agent.findUnique({
    where: { id: agentId, workspaceId },
    select: { cannotDo: true },
  })
  if (!agent) {
    // 找不到 agent 时保守拒绝（避免无主执行）
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

  return { allowed: true }
}

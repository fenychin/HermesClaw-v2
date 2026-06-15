/**
 * 自动化授权等级三级粒度策略解析器（AGENTS.md §4.7 / §5.2 / §6.2）
 *
 * —— 三级回退优先级：
 *      action-specific  (workspace, agentId, actionType)
 *      → agent-default  (workspace, agentId, null)
 *      → workspace-default (workspace, null, null)
 *      → 无任何记录 → system-default L1 / low
 *
 * —— 与 src/types/harness.ts 中的 `resolveAutomationLevel(level, riskLevel)` 是
 *    互不替代的两个层次：
 *      - `resolveAutomationLevel`：单值 fallback（"显式标注 OR 由 risk 派生"）
 *      - `resolveAutomationPolicy`（本文件）：从 DB 读 workspace/agent/action 三级策略
 *    本文件只做 DB 解析；调用方拿到 `ResolvedPolicy.automationLevel` 后自己决定是否
 *    再经 `clampAutomationLevel` 钳制客户端传入值。
 *
 * —— SQLite 把 NULL 视为 distinct，三级行可以共存于唯一约束之下；
 *    单次 findMany OR 三段查询，内存里按 source 优先级 + priority 降序挑第一条。
 */

import { prisma } from "@/lib/prisma"
import {
  AutomationLevelSchema,
  RiskLevelSchema,
  type AutomationLevel,
  type RiskLevel,
} from "@hermesclaw/event-contracts"
import { parseJsonField } from "@/lib/api-utils"
import { logger } from "@/lib/logger"

// ==============================
// 类型
// ==============================

export type PolicySource =
  | "action-specific"
  | "agent-default"
  | "workspace-default"
  | "system-default"

export interface ResolvedPolicy {
  automationLevel: AutomationLevel
  riskLevel: RiskLevel
  requireApproval: boolean
  approverIds: string[]
  source: PolicySource
  policyId: string | null
}

// ==============================
// 常量
// ==============================

/** L1=1 ... L4=4，用于 clamp 比较与 source 优先级排序 */
export const LEVEL_RANK: Record<AutomationLevel, number> = {
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
}

/** source 优先级（数字越大越优先） */
const SOURCE_RANK: Record<Exclude<PolicySource, "system-default">, number> = {
  "action-specific": 3,
  "agent-default": 2,
  "workspace-default": 1,
}

const SYSTEM_DEFAULT: ResolvedPolicy = {
  automationLevel: "L1",
  riskLevel: "low",
  requireApproval: false,
  approverIds: [],
  source: "system-default",
  policyId: null,
}

// ==============================
// 内部工具
// ==============================

interface PolicyRow {
  id: string
  agentId: string | null
  actionType: string | null
  automationLevel: string
  riskLevel: string
  requireApproval: boolean
  requireApproverIds: string
  priority: number
}

function classifySource(
  row: Pick<PolicyRow, "agentId" | "actionType">,
): Exclude<PolicySource, "system-default"> | null {
  if (row.agentId !== null && row.actionType !== null) return "action-specific"
  if (row.agentId !== null && row.actionType === null) return "agent-default"
  if (row.agentId === null && row.actionType === null) return "workspace-default"
  // (agentId=null, actionType!=null) 业务上不允许，DB 兜底忽略
  return null
}

function rowToResolved(row: PolicyRow): ResolvedPolicy | null {
  const source = classifySource(row)
  if (!source) return null

  const levelParsed = AutomationLevelSchema.safeParse(row.automationLevel)
  const riskParsed = RiskLevelSchema.safeParse(row.riskLevel)
  if (!levelParsed.success || !riskParsed.success) {
    logger.warn("[policy-resolver] DB 中 automationLevel/riskLevel 越界，降级为 system-default", {
      policyId: row.id,
      automationLevel: row.automationLevel,
      riskLevel: row.riskLevel,
    })
    return null
  }

  const approverIds = parseJsonField<string[]>(row.requireApproverIds, [])
  const safeApproverIds = Array.isArray(approverIds)
    ? approverIds.filter((x): x is string => typeof x === "string")
    : []

  return {
    automationLevel: levelParsed.data,
    riskLevel: riskParsed.data,
    requireApproval: Boolean(row.requireApproval),
    approverIds: safeApproverIds,
    source,
    policyId: row.id,
  }
}

// ==============================
// 主入口
// ==============================

/**
 * 三级回退解析 workspace/agent/actionType 的有效自动化策略。
 *
 * @param workspaceId 必填
 * @param agentId     null 表示求"workspace 全局默认"
 * @param actionType  null 表示求"该 agent 的默认（不区分动作）"
 *
 * @returns 命中行解析为 ResolvedPolicy；未命中或所有命中行越界 → system-default L1/low
 */
export async function resolveAutomationPolicy(
  workspaceId: string,
  agentId: string | null,
  actionType: string | null,
): Promise<ResolvedPolicy> {
  // 候选条件：
  //   1) (agentId, actionType)        action-specific  — 仅当两者都非空
  //   2) (agentId, null)              agent-default    — 仅当 agentId 非空
  //   3) (null, null)                 workspace-default
  const orConditions: Array<{ agentId: string | null; actionType: string | null }> = []
  if (agentId !== null && actionType !== null) {
    orConditions.push({ agentId, actionType })
  }
  if (agentId !== null) {
    orConditions.push({ agentId, actionType: null })
  }
  orConditions.push({ agentId: null, actionType: null })

  const rows = await prisma.automationPolicy.findMany({
    where: {
      workspaceId,
      OR: orConditions,
    },
    select: {
      id: true,
      agentId: true,
      actionType: true,
      automationLevel: true,
      riskLevel: true,
      requireApproval: true,
      requireApproverIds: true,
      priority: true,
    },
  })

  if (rows.length === 0) return { ...SYSTEM_DEFAULT }

  const candidates: Array<{ resolved: ResolvedPolicy; priority: number }> = []
  for (const row of rows) {
    const resolved = rowToResolved(row)
    if (resolved) candidates.push({ resolved, priority: row.priority })
  }
  if (candidates.length === 0) return { ...SYSTEM_DEFAULT }

  // 排序：source rank DESC → priority DESC（同优先级稳定，由 DB 顺序兜底）
  candidates.sort((a, b) => {
    const aRank = a.resolved.source === "system-default" ? 0 : SOURCE_RANK[a.resolved.source]
    const bRank = b.resolved.source === "system-default" ? 0 : SOURCE_RANK[b.resolved.source]
    if (bRank !== aRank) return bRank - aRank
    return b.priority - a.priority
  })

  return candidates[0].resolved
}

// ==============================
// clamp：客户端传入 vs 已落地策略
// ==============================

/**
 * 把客户端传入的 `requested` 等级钳制到不超过 `policyMax`。
 * —— 防止越权抬升（前端 / 第三方 / 内部 BUG 误传 L4 时被服务端拉回到策略允许的最高级）。
 *
 * @returns `requested` 若 ≤ policyMax 则原样返回；否则返回 policyMax
 */
export function clampAutomationLevel(
  requested: AutomationLevel,
  policyMax: AutomationLevel,
): AutomationLevel {
  return LEVEL_RANK[requested] <= LEVEL_RANK[policyMax] ? requested : policyMax
}

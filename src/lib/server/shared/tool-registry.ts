/**
 * 工具注册表与短期授权（AGENTS.md 第四章 4.3 受控工具接入）
 *
 * —— 所有工具须在 ToolRegistry 注册；生产调用通过 ToolGrant 签发短期 Token（≤1h）；
 *    高危工具（riskLevel=high）须双 actor 审批后方可签发。
 *
 * ⚠️ 仅服务端调用。Token 生成用 crypto.randomUUID（不可在脚本环境用 Math.random）。
 */
import { prisma } from "@/lib/prisma"

/** 短期 Token 有效期（毫秒）：15 分钟 */
export const GRANT_TTL_MS = 15 * 60 * 1000

export interface IssueGrantInput {
  toolId: string
  agentId: string
  scopes: string[]
  issuedBy: string
  /** 高危工具需提供两个不同审批者 */
  approvedBy1?: string
  approvedBy2?: string
}

export interface IssueGrantResult {
  ok: boolean
  error?: string
  grant?: {
    id: string
    token: string
    expiresAt: string
    toolId: string
    agentId: string
    scopes: string[]
  }
}

/**
 * 为某智能体签发一个工具短期授权。
 * 高危工具要求 approvedBy1/2 存在且不同（双审批）。
 */
export async function issueToolGrant(
  input: IssueGrantInput,
): Promise<IssueGrantResult> {
  const tool = await prisma.toolRegistry.findUnique({ where: { id: input.toolId } })
  if (!tool) return { ok: false, error: "工具未注册" }
  if (!tool.enabled) return { ok: false, error: "工具已禁用" }

  // 高危工具双审批校验
  if (tool.riskLevel === "high") {
    if (!input.approvedBy1 || !input.approvedBy2) {
      return { ok: false, error: "高危工具需双人审批（approvedBy1 与 approvedBy2）" }
    }
    if (input.approvedBy1 === input.approvedBy2) {
      return { ok: false, error: "双审批者不能为同一人" }
    }
  }

  const now = Date.now()
  const expiresAt = new Date(now + GRANT_TTL_MS)
  const grant = await prisma.toolGrant.create({
    data: {
      toolId: input.toolId,
      agentId: input.agentId,
      scopes: JSON.stringify(input.scopes),
      token: crypto.randomUUID(),
      expiresAt,
      issuedBy: input.issuedBy,
      approvedBy1: input.approvedBy1 ?? null,
      approvedBy2: input.approvedBy2 ?? null,
    },
  })

  return {
    ok: true,
    grant: {
      id: grant.id,
      token: grant.token,
      expiresAt: grant.expiresAt.toISOString(),
      toolId: grant.toolId,
      agentId: grant.agentId,
      scopes: input.scopes,
    },
  }
}

/**
 * 校验一个工具 Token 是否有效（存在、未吊销、未过期）。
 * @param nowMs 当前时间戳（毫秒），由调用方传入以避免脚本环境 Date.now 限制
 */
export async function verifyToolToken(
  token: string,
  nowMs: number,
): Promise<{ valid: boolean; reason?: string }> {
  const grant = await prisma.toolGrant.findUnique({ where: { token } })
  if (!grant) return { valid: false, reason: "Token 不存在" }
  if (grant.revoked) return { valid: false, reason: "Token 已吊销" }
  if (grant.expiresAt.getTime() < nowMs) {
    return { valid: false, reason: "Token 已过期" }
  }
  return { valid: true }
}

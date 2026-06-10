/**
 * 高危操作护栏（AGENTS.md 第四章 4.5 安全护栏 / 第五章 A7）
 *
 * —— 对「删除持久化数据」「变更智能体任务边界」等高危操作要求显式二次确认：
 *    DELETE 走 query `?confirm=true`；PATCH 走已解析 body 的 `confirm:true`。
 *    缺确认 → 返回 409 + { requiresConfirmation:true }，前端据此弹二次确认。
 *
 * 护栏仅负责「判定 + 取操作者」，删除/更新副作用与审计写入仍由调用方控制
 *（职责单一，便于在不同路由复用）。
 */
import { actorFromSession } from "@/lib/server/audit"
import { resolveAutomationLevel } from "@/types"
import type { RiskLevel, AutomationLevel } from "@/types"

export interface GuardrailPass {
  ok: true
  /** 当前操作者标识（用于随后写审计） */
  actor: string
  /** 解析出的自动化授权等级（仅 checkAutomationGate 设置，供调用方审计/分支） */
  level?: AutomationLevel
}
export interface GuardrailBlock {
  ok: false
  /** 直接返回给客户端的响应（409 / 403） */
  response: Response
  /** 解析出的自动化授权等级（仅 checkAutomationGate 设置，供调用方审计/分支） */
  level?: AutomationLevel
}
export type GuardrailResult = GuardrailPass | GuardrailBlock

/** 构造 409 需确认响应 */
function blocked(message: string, status = 409): GuardrailBlock {
  return {
    ok: false,
    response: Response.json(
      { success: false, error: message, requiresConfirmation: status === 409 ? true : undefined },
      { status },
    ),
  }
}

/**
 * DELETE 等无 body 的高危操作：要求 query `?confirm=true`。
 * 通过则附带当前操作者标识。
 */
export async function checkConfirmQuery(
  request: Request,
  message = "高危操作需二次确认（追加 ?confirm=true）",
): Promise<GuardrailResult> {
  const { searchParams } = new URL(request.url)
  if (searchParams.get("confirm") !== "true") {
    return blocked(message)
  }
  return { ok: true, actor: await actorFromSession() }
}

/**
 * PATCH 等已解析 body 的高危变更：要求 `body.confirm === true`。
 */
export async function checkConfirmValue(
  confirm: unknown,
  message = "高危变更需二次确认（body.confirm=true）",
): Promise<GuardrailResult> {
  if (confirm !== true) {
    return blocked(message)
  }
  return { ok: true, actor: await actorFromSession() }
}

// ==============================
// 自动化授权分级门禁（AGENTS.md §4.7）
// ==============================

export interface AutomationGateInput {
  /** 提案显式标注的自动化等级（可能为 null） */
  automationLevel: string | null | undefined
  /** 提案的风险等级（用于派生 automationLevel） */
  riskLevel: string
  /** 调用方已校验通过的确认标记（L3 需为 true） */
  confirmed: boolean
  /** 动作名称，用于错误消息（如 "批准"、"回滚"） */
  actionName: string
}

/**
 * 自动化授权分级拦截（AGENTS.md §4.7）
 * —— 统一 L4/L3 门禁逻辑，供 approve / reject / rollback 等治理路由复用，
 *    避免在多处重复 L4/L3 判定（§4.7「统一门禁」）。
 *
 * - L4：硬拒绝 403，规范化拒绝体 `{ error:'L4_FORBIDDEN', message }`（绝对禁止自动，审批通道亦不得放行）
 * - L3：未确认时返回 409 + requiresConfirmation:true
 * - L2/L1：放行
 *
 * 返回结果统一携带解析出的 `level`，调用方可据此审计/分支，无需自行重算。
 *
 * @returns GuardrailBlock（需拦截）| GuardrailPass（放行，附 actor）
 */
export async function checkAutomationGate(
  input: AutomationGateInput,
): Promise<GuardrailResult> {
  const level = resolveAutomationLevel(
    input.automationLevel,
    input.riskLevel as RiskLevel,
  )

  // L4：绝对禁止自动，审批通道亦不得放行 —— 统一规范化拒绝体（AGENTS.md §4.7）
  if (level === "L4") {
    return {
      ok: false,
      level,
      response: Response.json(
        {
          success: false,
          error: "L4_FORBIDDEN",
          message: "L4 动作禁止系统自动审批，须在源业务系统人工发起",
        },
        { status: 403 },
      ),
    }
  }

  // L3：高风险，须显式二次确认
  if (level === "L3" && !input.confirmed) {
    return {
      ...blocked(
        `L3 高风险操作，确认${input.actionName}后将立即生效且无法撤销，请二次确认`,
        409,
      ),
      level,
    }
  }

  return { ok: true, actor: await actorFromSession(), level }
}

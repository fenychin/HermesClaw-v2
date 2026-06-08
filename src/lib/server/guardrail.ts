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

export interface GuardrailPass {
  ok: true
  /** 当前操作者标识（用于随后写审计） */
  actor: string
}
export interface GuardrailBlock {
  ok: false
  /** 直接返回给客户端的 409 响应 */
  response: Response
}
export type GuardrailResult = GuardrailPass | GuardrailBlock

/** 构造 409 需确认响应 */
function blocked(message: string): GuardrailBlock {
  return {
    ok: false,
    response: Response.json(
      { success: false, error: message, requiresConfirmation: true },
      { status: 409 },
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

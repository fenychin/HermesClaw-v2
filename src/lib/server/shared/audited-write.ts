/**
 * 写操作审计封装（AGENTS.md §4.3 受控工具接入 / §5 #3 禁止静默执行）
 *
 * —— 收敛「预记录审计 → 执行写操作 → 成功/失败回填」这一在多个写路由
 *    （conversations / messages / inquiries / quotations 等）重复出现的样板：
 *
 *      const entry = await createAuditEntry({...})   // 执行前预记录
 *      try {
 *        const r = await <写操作>
 *        await updateAuditEntry({ status: "success", ... })
 *        return r
 *      } catch (error) {
 *        await updateAuditEntry({ status: "failed", detail })
 *        throw error
 *      }
 *
 * —— 设计约束：
 *    - **失败时 re-throw 原始错误**，由调用方的 catch 决定 HTTP 响应
 *      （ApiResponse.error / errorResponse / ForbiddenError → 403），
 *      封装只统一审计骨架，不吞错、不决定响应。
 *    - `targetId` 须由调用方预生成并传入 entry（保证审计从预记录起即可溯源，
 *      AGENTS.md §4.3）；本封装不负责生成 ID。
 *    - 成功后若需根据执行结果回填 detail / contextSnapshot（如写入记录 ID、
 *      关联工作流结果），通过 `options.onSuccess(result)` 返回补充字段；
 *      返回 undefined 的字段不覆盖预记录值（updateAuditEntry 语义）。
 *
 * ⚠️ 仅在服务端调用。审计写入失败由 createAuditEntry/updateAuditEntry 内部
 *    静默吞错（治理留痕丢失会 console.error），不阻断主流程。
 */
import {
  createAuditEntry,
  updateAuditEntry,
  type CreateAuditEntryInput,
} from "@/lib/server/shared/audit"

export interface AuditedWriteOptions<T> {
  /**
   * 成功后根据执行结果生成补充审计字段（detail / contextSnapshot 回填）。
   * 返回 undefined 的字段保留预记录值。
   */
  onSuccess?: (result: T) => {
    detail?: string
    contextSnapshot?: Record<string, unknown>
  }
}

/**
 * 在预记录审计的保护下执行一次写操作。
 *
 * @param entry   预记录审计输入（targetId 须由调用方预生成）
 * @param run     实际写操作 thunk；抛错即标记审计 failed 并 re-throw
 * @param options 成功回填钩子
 * @returns       run 的返回值
 *
 * @example
 *   const conversationId = crypto.randomUUID()
 *   const conversation = await auditedWrite(
 *     {
 *       actor, action: "conversation.create", targetType: "conversation",
 *       targetId: conversationId, riskLevel: "low", automationLevel: "L2",
 *       triggeredBy: "user", workspaceId, detail: `创建对话: ${title}`,
 *     },
 *     () => prisma.conversation.create({ data: { id: conversationId, ... } }),
 *   )
 */
export async function auditedWrite<T>(
  entry: CreateAuditEntryInput,
  run: () => Promise<T>,
  options?: AuditedWriteOptions<T>,
): Promise<T> {
  const recorded = await createAuditEntry(entry)
  try {
    const result = await run()
    const extra = options?.onSuccess?.(result)
    await updateAuditEntry({
      auditId: recorded.auditId,
      status: "success",
      detail: extra?.detail,
      contextSnapshot: extra?.contextSnapshot,
    })
    return result
  } catch (error) {
    await updateAuditEntry({
      auditId: recorded.auditId,
      status: "failed",
      detail: `失败: ${error instanceof Error ? error.message : "未知错误"}`,
    })
    throw error
  }
}

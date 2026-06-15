/**
 * task → workspace 反查工具（修复 V1/T2/T3 跨租户隔离裂缝）
 *
 * 背景：
 *   - OpenClaw runtime 不持有 workspace 上下文，所有 ExecutionEvent / 终态回调
 *     仅携带 taskId。
 *   - Hermes 侧需要把这些 M2M 入口的副作用（EvolutionLog / AuditLog / connector.*）
 *     正确归属到 task 所属 workspace，否则会污染 §6.1 多租户隔离边界。
 *
 * 实现路径（v0.12.x 阶段不引入新表）：
 *   - `Task` 表当前由 /api/task 系列产品端点写入，不一定覆盖 dispatch 路径。
 *   - `IdempotencyKey` 表在 /api/task/dispatch 落库时持有 (workspaceId, taskId)，
 *     是当前阶段最可靠的反查源。
 *   - 反查不到时返回 null —— 调用方应：① 业务关键路径直接 422；② 留痕兜底用
 *     `SYSTEM_FALLBACK_WORKSPACE_ID` 写入专用系统 workspace，避免污染真实租户。
 *
 * v0.13+ 演进路径：
 *   - 抽 `Task` 表为 dispatch 入口的真相源，覆盖所有 envelope 派发；
 *   - 反查切换到 `Task.workspaceId`，IdempotencyKey 退化为纯幂等键存储。
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"

/**
 * 反查不到 task → workspace 时使用的兜底值。
 * 与真实租户 "default" 严格区分：留痕仍然能写入，但不会污染任何用户的指标视图。
 */
export const SYSTEM_FALLBACK_WORKSPACE_ID = "__system_fallback__"

/**
 * 通过 taskId 反查 workspaceId。
 *
 * @returns 命中返回 workspaceId；查询失败 / 未命中返回 null
 *   —— 注意：调用方必须区分这两种情况（业务关键路径应 422，留痕路径用兜底）。
 */
export async function lookupWorkspaceByTaskId(
  taskId: string,
): Promise<string | null> {
  if (!taskId) return null
  try {
    // IdempotencyKey 是 dispatch 入口的副作用，按 taskId 取最新一条
    const idem = await prisma.idempotencyKey.findFirst({
      where: { taskId },
      select: { workspaceId: true },
      orderBy: { createdAt: "desc" },
    })
    if (idem) return idem.workspaceId
    return null
  } catch (error) {
    logger.error("[task-lookup] 反查 workspaceId 异常", {
      taskId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * 确保系统兜底 workspace 存在（幂等）。
 * AuditLog / EvolutionLog 有 workspaceId 外键约束，写入兜底之前必须先建。
 * 失败由调用方处理（typically 让主流程降级而非崩溃）。
 */
let _ensuredFallback = false
export async function ensureSystemFallbackWorkspace(): Promise<void> {
  if (_ensuredFallback) return
  try {
    await prisma.workspace.upsert({
      where: { id: SYSTEM_FALLBACK_WORKSPACE_ID },
      update: {},
      create: {
        id: SYSTEM_FALLBACK_WORKSPACE_ID,
        name: "[System Fallback]",
        plan: "enterprise",
      },
    })
    _ensuredFallback = true
  } catch (error) {
    logger.error("[task-lookup] 系统兜底 workspace 创建失败", {
      error: error instanceof Error ? error.message : String(error),
    })
    // 不 throw —— 调用方需对 isFallback=true 路径自行做空写防御
  }
}

/**
 * 同 lookupWorkspaceByTaskId，但反查失败 / 未命中时返回兜底 workspace。
 * —— 仅用于"必须留痕，但允许归属系统兜底"的场景（如 connector.execute 审计）。
 *    业务关键路径（如 evaluate-event 写 EvolutionLog 影响指标视图）禁用此函数，
 *    应直接调用 lookupWorkspaceByTaskId 并对 null 返回 422。
 *
 * 副作用：返回 isFallback=true 之前会确保 SYSTEM_FALLBACK_WORKSPACE_ID 存在
 * （否则外键约束会让后续 AuditLog/EvolutionLog 写入失败）。
 */
export async function lookupWorkspaceByTaskIdOrFallback(
  taskId: string,
): Promise<{ workspaceId: string; isFallback: boolean }> {
  const found = await lookupWorkspaceByTaskId(taskId)
  if (found) return { workspaceId: found, isFallback: false }
  await ensureSystemFallbackWorkspace()
  return { workspaceId: SYSTEM_FALLBACK_WORKSPACE_ID, isFallback: true }
}

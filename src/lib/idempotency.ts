/**
 * 幂等键（Idempotency Key）持久化工具
 *
 * AGENTS.md §3.4：所有跨域写操作必须具备幂等保护。
 *
 * —— 调用方在请求头携带 `x-idempotency-key`，本模块负责：
 *    1. checkIdempotencyKey() —— 命中则返回缓存的 taskId（路由层直接返回 200）
 *    2. storeIdempotencyKey() —— 首次写入后落库，限定 (workspaceId, key) 唯一
 *
 * —— 不持有完整请求体，**等效性由调用方保证**：相同幂等键意味着调用方承诺
 *    其请求语义一致。这是 Stripe / GitHub 等 Idempotency-Key 头的标准约定。
 *
 * —— 写入失败不阻断主流程；但治理留痕丢失需在审计层补救。
 */
import { prisma } from "@/lib/prisma"

export interface IdempotencyHit {
  taskId: string
  workspaceId: string
  scope: string | null
  createdAt: Date
}

/**
 * 校验幂等键是否已存在。
 * @returns 命中返回 { taskId, ... }；未命中返回 null
 */
export async function checkIdempotencyKey(
  workspaceId: string,
  key: string,
): Promise<IdempotencyHit | null> {
  if (!key) return null
  try {
    const record = await prisma.idempotencyKey.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    })
    if (!record) return null
    // 已过期视为未命中（仍然返回 null，不主动清理 —— 由 cleanup 任务负责）
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      return null
    }
    return {
      taskId: record.taskId,
      workspaceId: record.workspaceId,
      scope: record.scope,
      createdAt: record.createdAt,
    }
  } catch (error) {
    console.error("[idempotency] checkIdempotencyKey 异常，按未命中处理：", {
      workspaceId,
      key,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export interface StoreIdempotencyKeyInput {
  workspaceId: string
  key: string
  taskId: string
  /** 写操作所在端点（如 `/api/tasks/envelope`），便于审计排查 */
  scope?: string
  /** TTL（毫秒）；默认 24h —— 24h 内重放视为同一请求 */
  ttlMs?: number
}

/** 默认 TTL：24 小时 */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

/**
 * 持久化幂等键 → taskId 映射。
 * 若并发写入触发 (workspaceId, key) 唯一冲突，吞下错误并视为已写入。
 */
export async function storeIdempotencyKey(
  input: StoreIdempotencyKeyInput,
): Promise<void> {
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS
  const expiresAt = new Date(Date.now() + ttlMs)
  try {
    await prisma.idempotencyKey.create({
      data: {
        key: input.key,
        taskId: input.taskId,
        workspaceId: input.workspaceId,
        scope: input.scope ?? null,
        expiresAt,
      },
    })
  } catch (error) {
    // P2002 = unique constraint violation (并发请求都写到这里) —— 静默吞下，
    // 调用方下次 checkIdempotencyKey 命中即可
    const code = (error as { code?: string })?.code
    if (code === "P2002") return
    console.error("[idempotency] storeIdempotencyKey 写入失败：", {
      workspaceId: input.workspaceId,
      key: input.key,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 读取请求头中的幂等键（兼容 `x-idempotency-key` 与 `idempotency-key`）。
 */
export function readIdempotencyKey(req: { headers: Headers }): string | null {
  const fromX = req.headers.get("x-idempotency-key")
  if (fromX) return fromX
  return req.headers.get("idempotency-key")
}

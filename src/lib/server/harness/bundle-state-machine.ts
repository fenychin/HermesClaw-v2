/**
 * HarnessBundle 状态机（CLAUDE.md §4.2 / §8.1）
 *
 * 合法状态转换：
 *   DRAFT  → CANARY        部署到灰度
 *   CANARY → ACTIVE        全量激活
 *   CANARY → ROLLED_BACK   灰度失败回滚
 *   ACTIVE → DEPRECATED    被新版本替代
 *   ACTIVE → ROLLED_BACK   紧急回滚
 *
 * 任何不在白名单内的转换都视为非法，统一抛出 {@link InvalidTransitionError}，
 * 由 Route Handler 映射到 HTTP 409。
 *
 * —— 单源契约：状态值定义在 packages/harness-schema/src/harness-bundle.ts，
 *    本文件不再重复声明枚举值，避免 SQLite 列字符串与契约值漂移。
 */

import type { HarnessBundleStatus } from "@hermesclaw/harness-schema"

// ============================================================
// 合法转换白名单
// ============================================================

type StatusTransition = readonly [HarnessBundleStatus, HarnessBundleStatus]

const VALID_TRANSITIONS: ReadonlyArray<StatusTransition> = [
  ["DRAFT", "CANARY"],
  ["CANARY", "ACTIVE"],
  ["CANARY", "ROLLED_BACK"],
  ["ACTIVE", "DEPRECATED"],
  ["ACTIVE", "ROLLED_BACK"],
] as const

// ============================================================
// 异常类型
// ============================================================

/**
 * 非法状态转换异常。
 *
 * Route Handler 捕获后应返回 409 + 错误码 INVALID_TRANSITION，
 * 同时把 message 透传给前端用于提示「可用的下一步有哪些」。
 */
export class InvalidTransitionError extends Error {
  readonly code = "INVALID_STATUS_TRANSITION" as const
  readonly from: HarnessBundleStatus
  readonly to: HarnessBundleStatus
  readonly available: HarnessBundleStatus[]

  constructor(from: HarnessBundleStatus, to: HarnessBundleStatus) {
    const available = getAvailableTransitions(from)
    const availableText = available.length > 0 ? available.join(", ") : "none"
    super(
      `INVALID_STATUS_TRANSITION: ${from} → ${to} is not allowed. ` +
        `Valid transitions from ${from}: ${availableText}`,
    )
    this.name = "InvalidTransitionError"
    this.from = from
    this.to = to
    this.available = available
  }
}

// ============================================================
// 公共 API
// ============================================================

/** 给定 (from, to) 是否为白名单内的合法状态转换。 */
export function isValidTransition(
  from: HarnessBundleStatus,
  to: HarnessBundleStatus,
): boolean {
  return VALID_TRANSITIONS.some(([f, t]) => f === from && t === to)
}

/**
 * 校验状态转换；非法时抛出 {@link InvalidTransitionError}。
 *
 * Route Handler 在执行 `prisma.update({ status: ... })` 之前调用，
 * 不合法直接拒绝，避免数据库出现非法状态。
 */
export function validateTransition(
  from: HarnessBundleStatus,
  to: HarnessBundleStatus,
): void {
  if (!isValidTransition(from, to)) {
    throw new InvalidTransitionError(from, to)
  }
}

/** 返回从 from 出发可用的所有目标状态（按白名单顺序）。 */
export function getAvailableTransitions(
  from: HarnessBundleStatus,
): HarnessBundleStatus[] {
  return VALID_TRANSITIONS.filter(([f]) => f === from).map(([, t]) => t)
}

/**
 * 自动化等级升降级与高危门禁（AGENTS.md §4.7 / §5.2）
 *
 * —— 纯函数模块；不依赖 prisma / 不依赖 next-auth。
 * —— L3/L4 升级一律拒绝直接落库，必须先在 Harness 提案审批通过。
 * —— L4 由 `L4_ALLOWED_WORKSPACES` 环境变量白名单控制；未列入工作区一律不允许。
 */

import type { AutomationLevel } from "@hermesclaw/event-contracts"

const LEVEL_RANK: Record<AutomationLevel, number> = {
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
}

// ==============================
// 等级升降判定
// ==============================

export function isLevelUpgrade(from: AutomationLevel, to: AutomationLevel): boolean {
  return LEVEL_RANK[to] > LEVEL_RANK[from]
}

/**
 * 升级到 L3/L4 必须经过 Harness Proposal 审批；其他升级 / 降级一律不强制审批。
 */
export function requiresApprovalForUpgrade(
  from: AutomationLevel,
  to: AutomationLevel,
): boolean {
  if (!isLevelUpgrade(from, to)) return false
  return to === "L3" || to === "L4"
}

// ==============================
// L4 白名单
// ==============================

/**
 * 读取 `L4_ALLOWED_WORKSPACES` 环境变量（逗号分隔），判断当前 workspace 是否在白名单内。
 *
 * —— 未配置环境变量 → 一律 false（默认禁用）。
 * —— 仅在经过安全评估后填写允许的 workspace ID。
 */
export function isL4Allowed(workspaceId: string): boolean {
  const raw = process.env.L4_ALLOWED_WORKSPACES ?? ""
  const allowed = raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
  return allowed.includes(workspaceId)
}

// ==============================
// 等级变更校验（统一门禁）
// ==============================

export type LevelChangeError = "L4_NOT_ALLOWED" | "REQUIRES_HARNESS_APPROVAL"

export type LevelChangeResult =
  | { ok: true }
  | { ok: false; code: LevelChangeError; message: string }

/**
 * 校验一次等级变更是否允许直接落库（POST 创建 / PATCH 更新等）。
 *
 * —— 升级到 L4 + 工作区不在白名单 → `L4_NOT_ALLOWED`（403）
 * —— 升级到 L3/L4（含上一条不命中时）→ `REQUIRES_HARNESS_APPROVAL`（422）
 * —— 其他（不变 / 降级 / 升 L2）→ ok
 */
export function validateLevelChange(
  from: AutomationLevel,
  to: AutomationLevel,
  workspaceId: string,
): LevelChangeResult {
  // L4 白名单门禁先于"是否升级"判定 —— 无论新建还是 PATCH，落到 L4 都必须在白名单
  if (to === "L4" && !isL4Allowed(workspaceId)) {
    return {
      ok: false,
      code: "L4_NOT_ALLOWED",
      message: "L4 不在该工作区白名单内（联系平台运营开通）",
    }
  }
  if (requiresApprovalForUpgrade(from, to)) {
    return {
      ok: false,
      code: "REQUIRES_HARNESS_APPROVAL",
      message: `升级到 ${to} 需先在 Harness 页面创建提案并完成审批`,
    }
  }
  return { ok: true }
}

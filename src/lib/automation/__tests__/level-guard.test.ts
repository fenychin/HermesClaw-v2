/**
 * level-guard 纯函数单测
 * —— AGENTS.md §4.7 / §5.2：升级到 L3/L4 必须经过 Harness 提案审批；
 *    L4 由 L4_ALLOWED_WORKSPACES 白名单控制。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  isLevelUpgrade,
  requiresApprovalForUpgrade,
  isL4Allowed,
  validateLevelChange,
} from "@/lib/automation/level-guard"

describe("level-guard / isLevelUpgrade", () => {
  it("L1 → L2 是升级", () => {
    expect(isLevelUpgrade("L1", "L2")).toBe(true)
  })
  it("L1 → L3 是升级", () => {
    expect(isLevelUpgrade("L1", "L3")).toBe(true)
  })
  it("L3 → L1 不是升级（降级）", () => {
    expect(isLevelUpgrade("L3", "L1")).toBe(false)
  })
  it("L2 → L2 不是升级（不变）", () => {
    expect(isLevelUpgrade("L2", "L2")).toBe(false)
  })
})

describe("level-guard / requiresApprovalForUpgrade", () => {
  it("L1 → L2 不需要审批", () => {
    expect(requiresApprovalForUpgrade("L1", "L2")).toBe(false)
  })
  it("L1 → L3 需要审批", () => {
    expect(requiresApprovalForUpgrade("L1", "L3")).toBe(true)
  })
  it("L2 → L3 需要审批", () => {
    expect(requiresApprovalForUpgrade("L2", "L3")).toBe(true)
  })
  it("L3 → L4 需要审批", () => {
    expect(requiresApprovalForUpgrade("L3", "L4")).toBe(true)
  })
  it("L4 → L3 是降级，不需要审批", () => {
    expect(requiresApprovalForUpgrade("L4", "L3")).toBe(false)
  })
  it("L3 → L3 不变，不需要审批", () => {
    expect(requiresApprovalForUpgrade("L3", "L3")).toBe(false)
  })
})

describe("level-guard / isL4Allowed", () => {
  const ORIGINAL = process.env.L4_ALLOWED_WORKSPACES

  beforeEach(() => {
    delete process.env.L4_ALLOWED_WORKSPACES
  })
  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.L4_ALLOWED_WORKSPACES
    } else {
      process.env.L4_ALLOWED_WORKSPACES = ORIGINAL
    }
  })

  it("env 未设置 → false（默认禁用）", () => {
    expect(isL4Allowed("ws-001")).toBe(false)
  })
  it("env 含目标 ws → true", () => {
    process.env.L4_ALLOWED_WORKSPACES = "ws-001,ws-002"
    expect(isL4Allowed("ws-001")).toBe(true)
    expect(isL4Allowed("ws-002")).toBe(true)
  })
  it("env 不含目标 ws → false", () => {
    process.env.L4_ALLOWED_WORKSPACES = "ws-other"
    expect(isL4Allowed("ws-001")).toBe(false)
  })
  it("env 含空白和空串能正确 trim", () => {
    process.env.L4_ALLOWED_WORKSPACES = " ws-001 , ,ws-002 "
    expect(isL4Allowed("ws-001")).toBe(true)
    expect(isL4Allowed("ws-002")).toBe(true)
    expect(isL4Allowed("")).toBe(false)
  })
})

describe("level-guard / validateLevelChange", () => {
  const ORIGINAL = process.env.L4_ALLOWED_WORKSPACES

  beforeEach(() => {
    delete process.env.L4_ALLOWED_WORKSPACES
  })
  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.L4_ALLOWED_WORKSPACES
    } else {
      process.env.L4_ALLOWED_WORKSPACES = ORIGINAL
    }
  })

  it("L1 → L2 直接允许", () => {
    expect(validateLevelChange("L1", "L2", "ws-001")).toEqual({ ok: true })
  })
  it("L2 → L2 不变也允许", () => {
    expect(validateLevelChange("L2", "L2", "ws-001")).toEqual({ ok: true })
  })
  it("L3 → L1 降级允许", () => {
    expect(validateLevelChange("L3", "L1", "ws-001")).toEqual({ ok: true })
  })
  it("L1 → L3 拒绝并返回 REQUIRES_HARNESS_APPROVAL", () => {
    const result = validateLevelChange("L1", "L3", "ws-001")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("REQUIRES_HARNESS_APPROVAL")
      expect(result.message).toContain("Harness")
    }
  })
  it("L1 → L4 + 不在白名单 → L4_NOT_ALLOWED（白名单优先于审批拒绝）", () => {
    const result = validateLevelChange("L1", "L4", "ws-001")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("L4_NOT_ALLOWED")
    }
  })
  it("L1 → L4 + 在白名单 → 仍因 REQUIRES_HARNESS_APPROVAL 拒绝", () => {
    process.env.L4_ALLOWED_WORKSPACES = "ws-001"
    const result = validateLevelChange("L1", "L4", "ws-001")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("REQUIRES_HARNESS_APPROVAL")
    }
  })
  it("L4 → L4 不变 + 不在白名单 → 仍然 L4_NOT_ALLOWED", () => {
    // 防御编程：即使 from=to，目标仍是 L4 时仍要保证白名单门禁生效
    const result = validateLevelChange("L4", "L4", "ws-001")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("L4_NOT_ALLOWED")
    }
  })
})

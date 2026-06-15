/**
 * HarnessBundleStatusSchema / BundleSnapshotReasonSchema 解析行为。
 *
 * 这两个 zod schema 是状态机与快照模块的单源契约（CLAUDE.md §2.2 Contract-First），
 * 不能漂移；本文件覆盖合法值通过、非法值拒绝、字面量类型正确三条最小用例。
 */

import { describe, expect, it } from "vitest"
import {
  BundleSnapshotReasonSchema,
  HarnessBundleStatusSchema,
} from "../src/harness-bundle"

describe("HarnessBundleStatusSchema", () => {
  it.each([
    "DRAFT",
    "CANARY",
    "ACTIVE",
    "DEPRECATED",
    "ROLLED_BACK",
  ] as const)("接受合法状态值 %s", (status) => {
    expect(HarnessBundleStatusSchema.parse(status)).toBe(status)
  })

  it("拒绝非法状态值（如小写）", () => {
    const result = HarnessBundleStatusSchema.safeParse("draft")
    expect(result.success).toBe(false)
  })

  it("拒绝任意字符串", () => {
    expect(HarnessBundleStatusSchema.safeParse("PENDING").success).toBe(false)
  })
})

describe("BundleSnapshotReasonSchema", () => {
  it.each(["pre-canary", "pre-activation", "manual"] as const)(
    "接受合法原因 %s",
    (reason) => {
      expect(BundleSnapshotReasonSchema.parse(reason)).toBe(reason)
    },
  )

  it("拒绝非白名单原因", () => {
    expect(BundleSnapshotReasonSchema.safeParse("auto-rollback").success).toBe(
      false,
    )
  })
})

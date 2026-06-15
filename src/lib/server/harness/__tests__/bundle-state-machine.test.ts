/**
 * HarnessBundle 状态机单元测试。
 *
 * 覆盖（CLAUDE.md §10：高危动作必须覆盖拒绝路径 / 审批路径 / 回滚路径）：
 * - 5 条合法转换全部允许
 * - 4 条典型非法转换全部拒绝
 * - getAvailableTransitions / validateTransition 行为
 */

import { describe, it, expect } from "vitest"
import {
  InvalidTransitionError,
  getAvailableTransitions,
  isValidTransition,
  validateTransition,
} from "../bundle-state-machine"

describe("HarnessBundle State Machine — 合法转换", () => {
  it("DRAFT → CANARY 合法", () => {
    expect(isValidTransition("DRAFT", "CANARY")).toBe(true)
  })

  it("CANARY → ACTIVE 合法", () => {
    expect(isValidTransition("CANARY", "ACTIVE")).toBe(true)
  })

  it("CANARY → ROLLED_BACK 合法（灰度失败回滚）", () => {
    expect(isValidTransition("CANARY", "ROLLED_BACK")).toBe(true)
  })

  it("ACTIVE → DEPRECATED 合法（被新版本替代）", () => {
    expect(isValidTransition("ACTIVE", "DEPRECATED")).toBe(true)
  })

  it("ACTIVE → ROLLED_BACK 合法（紧急回滚）", () => {
    expect(isValidTransition("ACTIVE", "ROLLED_BACK")).toBe(true)
  })
})

describe("HarnessBundle State Machine — 非法转换（拒绝路径）", () => {
  it("DRAFT → ACTIVE 非法（必须先经过 CANARY）", () => {
    expect(isValidTransition("DRAFT", "ACTIVE")).toBe(false)
  })

  it("ROLLED_BACK → ACTIVE 非法（终态不可复活）", () => {
    expect(isValidTransition("ROLLED_BACK", "ACTIVE")).toBe(false)
  })

  it("DEPRECATED → ACTIVE 非法（弃用版本不可重新激活）", () => {
    expect(isValidTransition("DEPRECATED", "ACTIVE")).toBe(false)
  })

  it("DRAFT → ROLLED_BACK 非法（尚未部署，无需回滚）", () => {
    expect(isValidTransition("DRAFT", "ROLLED_BACK")).toBe(false)
  })
})

describe("HarnessBundle State Machine — 工具函数", () => {
  it("getAvailableTransitions 返回合法目标集合", () => {
    expect(getAvailableTransitions("DRAFT")).toEqual(["CANARY"])
    expect(getAvailableTransitions("CANARY")).toEqual(["ACTIVE", "ROLLED_BACK"])
    expect(getAvailableTransitions("ACTIVE")).toEqual([
      "DEPRECATED",
      "ROLLED_BACK",
    ])
  })

  it("ROLLED_BACK 与 DEPRECATED 为终态，无可用转换", () => {
    expect(getAvailableTransitions("ROLLED_BACK")).toHaveLength(0)
    expect(getAvailableTransitions("DEPRECATED")).toHaveLength(0)
  })

  it("validateTransition 在合法转换上不抛", () => {
    expect(() => validateTransition("CANARY", "ACTIVE")).not.toThrow()
  })

  it("validateTransition 在非法转换上抛 InvalidTransitionError 且 message 含可选清单", () => {
    let caught: unknown
    try {
      validateTransition("DRAFT", "ACTIVE")
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(InvalidTransitionError)
    const err = caught as InvalidTransitionError
    expect(err.code).toBe("INVALID_STATUS_TRANSITION")
    expect(err.from).toBe("DRAFT")
    expect(err.to).toBe("ACTIVE")
    expect(err.available).toEqual(["CANARY"])
    expect(err.message).toContain("DRAFT → ACTIVE")
    expect(err.message).toContain("CANARY")
  })

  it("终态非法转换的 available 清单为空，message 标记 none", () => {
    try {
      validateTransition("ROLLED_BACK", "ACTIVE")
    } catch (e) {
      const err = e as InvalidTransitionError
      expect(err.available).toHaveLength(0)
      expect(err.message).toContain("none")
    }
  })
})

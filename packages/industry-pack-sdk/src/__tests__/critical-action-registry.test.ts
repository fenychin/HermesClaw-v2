/**
 * critical-action-registry 单元测试
 *
 * 验证行业包高危动作类型的注册/查询/并集/判断闭环，
 * 以及 loader 装载 manifest 后自动注册的端到端链路。
 */
import { describe, it, expect, beforeEach } from "vitest"
import {
  registerCriticalActionTypes,
  unregisterCriticalActionTypes,
  getCriticalActionTypes,
  getAllCriticalActionTypes,
  isCriticalActionTypeRegistered,
  clearCriticalActionTypes,
  loadIndustryManifest,
} from "../index"

describe("critical-action-registry", () => {
  beforeEach(() => {
    clearCriticalActionTypes()
  })

  it("注册后可按 packId 查询", () => {
    registerCriticalActionTypes("pack-a", ["a.send-email", "a.refund"])
    expect(getCriticalActionTypes("pack-a")).toEqual(["a.send-email", "a.refund"])
  })

  it("未注册的 packId 返回空数组", () => {
    expect(getCriticalActionTypes("pack-unknown")).toEqual([])
  })

  it("getAllCriticalActionTypes 返回所有 pack 的并集", () => {
    registerCriticalActionTypes("pack-a", ["a.send-email"])
    registerCriticalActionTypes("pack-b", ["b.send-email", "a.send-email"])
    const all = getAllCriticalActionTypes()
    expect(all.sort()).toEqual(["a.send-email", "b.send-email"])
  })

  it("isCriticalActionTypeRegistered 按 packId 精确判断", () => {
    registerCriticalActionTypes("pack-a", ["a.refund"])
    expect(isCriticalActionTypeRegistered("a.refund", "pack-a")).toBe(true)
    expect(isCriticalActionTypeRegistered("a.refund", "pack-b")).toBe(false)
    expect(isCriticalActionTypeRegistered("a.unknown", "pack-a")).toBe(false)
  })

  it("isCriticalActionTypeRegistered 不传 packId 时按并集判断", () => {
    registerCriticalActionTypes("pack-a", ["a.refund"])
    expect(isCriticalActionTypeRegistered("a.refund")).toBe(true)
    expect(isCriticalActionTypeRegistered("a.unknown")).toBe(false)
  })

  it("unregisterCriticalActionTypes 取消注册", () => {
    registerCriticalActionTypes("pack-a", ["a.refund"])
    unregisterCriticalActionTypes("pack-a")
    expect(getCriticalActionTypes("pack-a")).toEqual([])
    expect(isCriticalActionTypeRegistered("a.refund")).toBe(false)
  })

  it("loadIndustryManifest 装载后自动注册 manifest 声明的 criticalActionTypes", () => {
    // 装载真实的外贸行业包（manifest.yaml 已声明 criticalActionTypes）
    const manifest = loadIndustryManifest("foreign-trade")
    expect(manifest.criticalActionTypes).toContain("trade.send-quotation")
    expect(manifest.criticalActionTypes).toContain("trade.sign-contract")

    // 三域闭环：装载后 registry 应自动注册，Hermes 控制平面无需硬编码
    expect(isCriticalActionTypeRegistered("trade.send-quotation", "foreign-trade")).toBe(true)
    expect(isCriticalActionTypeRegistered("trade.sign-contract", "foreign-trade")).toBe(true)
    expect(isCriticalActionTypeRegistered("trade.unknown-action", "foreign-trade")).toBe(false)
  })
})

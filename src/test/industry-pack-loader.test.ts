import { describe, it, expect } from "vitest"
import { loadIndustryManifest, getCachedManifest } from "../lib/server/industry-pack-loader"

describe("Industry Pack Loader", () => {
  it("应该能够成功加载 foreign-trade 行业包并能通过 Zod 验证", () => {
    const manifest = loadIndustryManifest("foreign-trade")
    
    // 校验基本字段
    expect(manifest.packId).toBe("foreign-trade")
    expect(manifest.id).toBe("foreign-trade")
    expect(manifest.name).toBe("外贸行业包")
    expect(manifest.version).toBe("1.0.0")
    expect(manifest.compatibleHermesApi).toEqual({ min: "1.0.0", max: "2.0.0" })
  })

  it("当加载不存在的 pack 时抛出明确的未找到错误（而非 JSON.parse 错误）", () => {
    expect(() => {
      loadIndustryManifest("non-existent-pack-id")
    }).toThrow("Industry pack manifest not found")
  })

  it("manifest.directory.workflows 应该包含预期的外贸工作流 ID 列表", () => {
    const manifest = loadIndustryManifest("foreign-trade")
    
    expect(manifest.directory).toBeDefined()
    expect(manifest.directory?.workflows).toContain("inquiry-grade")
    expect(manifest.directory?.workflows).toContain("dev-letter")
    expect(manifest.directory?.workflows).toContain("customer-profile")
    expect(manifest.directory?.workflows).toContain("quote-gen")
    expect(manifest.directory?.workflows).toContain("followup")
    expect(manifest.directory?.workflows).toContain("close-deal")
  })

  it("getCachedManifest 应该返回缓存中的同一个 manifest 实例", () => {
    const m1 = getCachedManifest("foreign-trade")
    const m2 = getCachedManifest("foreign-trade")
    expect(m1).toBe(m2) // 同一个内存引用
  })
})

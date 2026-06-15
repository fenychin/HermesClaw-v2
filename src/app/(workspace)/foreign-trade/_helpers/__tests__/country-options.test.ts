import { describe, it, expect } from "vitest"
import { COUNTRY_OPTIONS, countryLabel, countryWithFlag } from "../country-options"

describe("country-options", () => {
  it("COUNTRY_OPTIONS 至少包含 12 个常用国家", () => {
    expect(COUNTRY_OPTIONS.length).toBeGreaterThanOrEqual(12)
    expect(COUNTRY_OPTIONS.some((o) => o.value === "US")).toBe(true)
  })

  it("countryLabel 对已知 ISO 代码返回中文名", () => {
    expect(countryLabel("US")).toBe("美国")
    expect(countryLabel("DE")).toBe("德国")
  })

  it("countryLabel 对未知值原样返回", () => {
    expect(countryLabel("ZZ")).toBe("ZZ")
  })

  it("countryWithFlag 对 OTHER 不带 emoji", () => {
    expect(countryWithFlag("OTHER")).toBe("其他")
  })

  it("countryWithFlag 对正常 ISO 代码包含 emoji + 中文", () => {
    const v = countryWithFlag("US")
    expect(v.includes("美国")).toBe(true)
    expect(v.length).toBeGreaterThan("美国".length) // 含 emoji
  })
})

/**
 * IndustryManifest 契约测试（CLAUDE.md §6.2-§6.3 行业包清单）。
 *
 * 测试范围：schema 校验 / 兼容性声明 / 迁移规则 / 目录完整性。
 */
import { describe, it, expect } from "vitest"
import {
  IndustryManifestSchema,
  MigrationRuleSchema,
  IndustryDirectorySchema,
  INDUSTRY_MANIFEST_VERSION,
} from "../industry-manifest"

describe("MigrationRule", () => {
  const valid = {
    fromVersion: "1.0.0",
    toVersion: "2.0.0",
    description: "AgentPolicy 字段重构：canDo 从 string[] 改为 ActionDef[]",
    breaking: true,
    rollbackStrategy: "回滚至 1.0.0 并恢复旧 AgentPolicy 结构",
  }

  it("合法 payload 通过", () => {
    expect(() => MigrationRuleSchema.parse(valid)).not.toThrow()
  })

  it("breaking 缺省为 false", () => {
    const { breaking, ...rest } = valid
    expect(MigrationRuleSchema.parse(rest).breaking).toBe(false)
  })
})

describe("IndustryDirectory", () => {
  it("全部目录缺省为 false", () => {
    const parsed = IndustryDirectorySchema.parse({})
    expect(parsed.agents).toBe(false)
    expect(parsed.workflows).toBe(false)
    expect(parsed.skills).toBe(false)
    expect(parsed.knowledge).toBe(false)
    expect(parsed.connectors).toBe(false)
    expect(parsed.schemas).toBe(false)
    expect(parsed.dashboards).toBe(false)
    expect(parsed.evalRules).toBe(false)
  })
})

describe("IndustryManifest（行业包清单）", () => {
  const valid = {
    packId: "pack-foreign-trade",
    name: "外贸行业包",
    version: "1.0.0",
    industry: "foreign-trade",
    description: "外贸行业智能体配置：询盘处理、报价生成、客户跟进",
    author: "HermesClaw Team",
    compatibleHermesApi: { min: "1.0.0", max: "2.0.0" },
    compatibleRuntimeApi: { min: "1.0.0", max: "2.0.0" },
    dependencies: [],
    migrationRules: [],
    directories: {
      agents: true,
      workflows: true,
      skills: true,
      knowledge: true,
      connectors: true,
      schemas: true,
      dashboards: false,
      evalRules: true,
    },
    languages: ["zh-CN", "en-US"],
    status: "active" as const,
    createdAt: "2026-06-13T12:00:00.000Z",
    updatedAt: "2026-06-13T12:00:00.000Z",
    version_field: INDUSTRY_MANIFEST_VERSION,
  }

  it("合法 payload 通过", () => {
    expect(() => IndustryManifestSchema.parse(valid)).not.toThrow()
  })

  it("序列化 round-trip 一致", () => {
    const restored = IndustryManifestSchema.parse(JSON.parse(JSON.stringify(valid)))
    expect(restored.packId).toBe("pack-foreign-trade")
    expect(restored.compatibleHermesApi.min).toBe("1.0.0")
    expect(restored.directories.agents).toBe(true)
    expect(restored.criticalActionTypes).toEqual([])
  })

  it("criticalActionTypes 可选且可声明", () => {
    const withCritical = IndustryManifestSchema.parse({
      ...valid,
      criticalActionTypes: ["trade.send-quotation", "trade.sign-contract"],
    })
    expect(withCritical.criticalActionTypes).toEqual([
      "trade.send-quotation",
      "trade.sign-contract",
    ])
  })

  it("缺必备字段被拒", () => {
    expect(() => IndustryManifestSchema.parse({})).toThrow()
    expect(() => IndustryManifestSchema.parse({ packId: "x" })).toThrow()
  })

  it("非法 status 被拒", () => {
    expect(() =>
      IndustryManifestSchema.parse({ ...valid, status: "deleted" }),
    ).toThrow()
  })

  it("缺省值生效", () => {
    const minimal = {
      packId: "pack-min",
      name: "最小包",
      version: "1.0.0",
      industry: "test",
      compatibleHermesApi: { min: "1.0.0", max: "1.0.0" },
      compatibleRuntimeApi: { min: "1.0.0", max: "1.0.0" },
      createdAt: "2026-06-13T12:00:00.000Z",
      updatedAt: "2026-06-13T12:00:00.000Z",
      version_field: INDUSTRY_MANIFEST_VERSION,
    }
    const parsed = IndustryManifestSchema.parse(minimal)
    expect(parsed.description).toBe("")
    expect(parsed.author).toBe("")
    expect(parsed.dependencies).toEqual([])
    expect(parsed.languages).toEqual(["zh-CN"])
    expect(parsed.status).toBe("draft")
    expect(parsed.criticalActionTypes).toEqual([])
  })

  it("不兼容的 API 版本区间格式被拒", () => {
    expect(() =>
      IndustryManifestSchema.parse({
        ...valid,
        compatibleHermesApi: "1.0.0", // 应为 { min, max } 对象
      }),
    ).toThrow()
  })
})

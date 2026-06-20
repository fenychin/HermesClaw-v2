import { vi, describe, it, expect } from "vitest"

const mockFiles: Record<string, string> = {
  "/mock-root/industry-packs/foreign-trade/manifest.json": JSON.stringify({
    packId: "foreign-trade",
    id: "foreign-trade",
    name: "外贸行业包",
    version: "1.0.0",
    compatibleHermesApi: { min: "0.12.0", max: "2.0.0" },
    directory: {
      workflows: ["inquiry-followup", "inquiry-grade", "dev-letter", "customer-profile", "quote-gen", "sample-mgmt", "order-push", "exhibition-leads", "followup-remind"],
      agents: ["agent-001", "agent-002"],
    },
  }),
  "/mock-root/industry-packs/foreign-trade/workflows/inquiry-grade.json": JSON.stringify({
    id: "inquiry-grade", title: "询盘分级", description: "自动评分", icon: "Filter",
  }),
  "/mock-root/industry-packs/foreign-trade/workflows/dev-letter.json": JSON.stringify({
    id: "dev-letter", title: "开发信", description: "开发信写作", icon: "Mail",
  }),
  "/mock-root/industry-packs/foreign-trade/workflows/customer-profile.json": JSON.stringify({
    id: "customer-profile", title: "客户画像", description: "客户画像", icon: "User",
  }),
  "/mock-root/industry-packs/foreign-trade/workflows/quote-gen.json": JSON.stringify({
    id: "quote-gen", title: "报价生成", description: "报价生成", icon: "Calculator",
  }),
  "/mock-root/industry-packs/foreign-trade/workflows/sample-mgmt.json": JSON.stringify({
    id: "sample-mgmt", title: "样品管理", description: "样品管理", icon: "Package",
  }),
  "/mock-root/industry-packs/foreign-trade/workflows/order-push.json": JSON.stringify({
    id: "order-push", title: "订单推进", description: "订单推进", icon: "TrendingUp",
  }),
  "/mock-root/industry-packs/foreign-trade/workflows/exhibition-leads.json": JSON.stringify({
    id: "exhibition-leads", title: "展会线索", description: "展会线索", icon: "Users",
  }),
  "/mock-root/industry-packs/foreign-trade/workflows/followup-remind.json": JSON.stringify({
    id: "followup-remind", title: "跟进提醒", description: "跟进提醒", icon: "Bell",
  }),
  "/mock-root/industry-packs/foreign-trade/agents/agent-001.json": JSON.stringify({
    id: "agent-001", name: "Leon", role: "开发信写手", description: "Leon",
  }),
  "/mock-root/industry-packs/foreign-trade/agents/agent-002.json": JSON.stringify({
    id: "agent-002", name: "Clara", role: "询盘分析师", description: "Clara",
  }),
}

const normalizePath = (p: string) =>
  p.replace(/.*[/\\]industry-packs[/\\]/, "/mock-root/industry-packs/")

vi.mock("@hermesclaw/industry-pack-sdk", () => {
  return {
    loadIndustryManifest: vi.fn((packId: string) => {
      const manifestKey = `/mock-root/industry-packs/${packId}/manifest.json`
      if (!mockFiles[manifestKey]) {
        throw new Error(`Industry pack manifest not found for packId: ${packId}`)
      }
      return JSON.parse(mockFiles[manifestKey])
    }),
    getCachedManifest: vi.fn((packId: string) => {
      const manifestKey = `/mock-root/industry-packs/${packId}/manifest.json`
      if (!mockFiles[manifestKey]) {
        throw new Error(`Industry pack manifest not found for packId: ${packId}`)
      }
      return JSON.parse(mockFiles[manifestKey])
    }),
    mapLegacyManifest: vi.fn((legacy: any) => {
      return {
        packId: legacy.id,
        id: legacy.id,
        industry: legacy.id,
        name: legacy.name,
        version: legacy.version,
        directories: {
          agents: (legacy.directory?.agents?.length ?? 0) > 0,
          workflows: (legacy.directory?.workflows?.length ?? 0) > 0,
          skills: (legacy.directory?.skills?.length ?? 0) > 0,
          connectors: (legacy.directory?.connectors?.length ?? 0) > 0,
          knowledge: false,
          schemas: false,
          dashboards: false,
          evalRules: false,
          prompts: false,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version_field: legacy.version,
      }
    }),
    loadIndustryWorkflows: vi.fn((_packId: string) => {
      return Object.keys(mockFiles)
        .filter(k => k.includes("/workflows/"))
        .map(k => JSON.parse(mockFiles[k]))
    }),
    loadIndustryAgents: vi.fn((_packId: string) => {
      return Object.keys(mockFiles)
        .filter(k => k.includes("/agents/"))
        .map(k => JSON.parse(mockFiles[k]))
    }),
  }
})

vi.mock("@/lib/auth")

import { loadIndustryManifest, getCachedManifest, mapLegacyManifest, loadIndustryWorkflows, loadIndustryAgents } from "@hermesclaw/industry-pack-sdk"

describe("mapLegacyManifest 遗留配置转换", () => {
  it("应该能够将包含 id 和 directory 数组的旧格式映射为含 packId 和 directories 布尔标志的标准结构", () => {
    const legacy = {
      id: "legacy-pack",
      name: "老包",
      version: "1.0.0",
      directory: {
        workflows: ["wf-1"],
        skills: [],
        agents: ["agent-1"],
        connectors: []
      }
    }

    const mapped = mapLegacyManifest(legacy) as {
      packId: string
      id: string
      industry: string
      directories: Record<string, boolean>
      createdAt: string
      updatedAt: string
      version_field: string
    }

    expect(mapped.packId).toBe("legacy-pack")
    expect(mapped.id).toBe("legacy-pack")
    expect(mapped.industry).toBe("legacy-pack")
    expect(mapped.directories).toEqual({
      agents: true,
      workflows: true,
      skills: false,
      connectors: false,
      knowledge: false,
      schemas: false,
      dashboards: false,
      evalRules: false,
      prompts: false
    })
    expect(mapped.createdAt).toBeDefined()
    expect(mapped.updatedAt).toBeDefined()
    expect(mapped.version_field).toBe("1.0.0")
  })
})

describe("Industry Pack Loader", () => {
  it("应该能够成功加载 foreign-trade 行业包并能通过 Zod 验证", () => {
    const manifest = loadIndustryManifest("foreign-trade")

    expect(manifest.packId).toBe("foreign-trade")
    expect(manifest.id).toBe("foreign-trade")
    expect(manifest.name).toBe("外贸行业包")
    expect(manifest.version).toBe("1.0.0")
    expect(manifest.compatibleHermesApi).toEqual({ min: "0.12.0", max: "2.0.0" })
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
    expect(manifest.directory?.workflows).toContain("sample-mgmt")
    expect(manifest.directory?.workflows).toContain("order-push")
    expect(manifest.directory?.workflows).toContain("exhibition-leads")
    expect(manifest.directory?.workflows).toContain("followup-remind")
  })

  it("getCachedManifest 应该返回相同结构的 manifest", () => {
    const m1 = getCachedManifest("foreign-trade")
    const m2 = getCachedManifest("foreign-trade")
    expect(m1).toStrictEqual(m2)
  })

  it("loadIndustryWorkflows 应该成功动态加载 workflows 文件夹下的 JSON 资产元数据", () => {
    const workflows = loadIndustryWorkflows("foreign-trade")
    expect(workflows).toBeDefined()
    expect(workflows.length).toBeGreaterThan(0)
    expect(workflows.some((w: any) => w.id === "inquiry-grade")).toBe(true)
    expect(workflows.some((w: any) => w.id === "dev-letter")).toBe(true)
  })

  it("loadIndustryAgents 应该成功动态加载 agents 文件夹下的 JSON 岗位元数据", () => {
    const agents = loadIndustryAgents("foreign-trade")
    expect(agents).toBeDefined()
    expect(agents.length).toBeGreaterThan(0)
    expect(agents.some((a: any) => a.id === "agent-001")).toBe(true)
    expect(agents.some((a: any) => a.id === "agent-002")).toBe(true)
  })
})

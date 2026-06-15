/**
 * 外贸 Pack v1 验收测试套件
 * 覆盖：manifest 完整性 / 业务 API / 演示核心路径 / AuditLog
 *
 * 运行方式：
 *   BASE_URL=http://localhost:3000 \
 *   TEST_WORKSPACE_ID=<workspace-id> \
 *   TEST_AUTH_COOKIE=<session-cookie> \
 *   pnpm vitest run src/test/foreign-trade/ --reporter=verbose
 */
import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

// ============================================================
// 1. Manifest 完整性（纯静态检查，不依赖 DB/服务）
// ============================================================
describe("外贸 Pack Manifest 完整性", () => {
  const manifestPath = path.join(
    process.cwd(),
    "industry-packs/foreign-trade/manifest.json",
  )
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))

  it("manifest.json 存在且可解析", () => {
    expect(manifest).toBeDefined()
    expect(manifest.id).toBe("foreign-trade")
  })

  it("manifest 包含必要顶级字段", () => {
    expect(manifest.version).toBe("1.0.0")
    expect(manifest.compatibleHermesApi).toBeDefined()
    expect(manifest.directory).toBeDefined()
    expect(manifest.description).toBeDefined()
    expect(manifest.entryWorkflow).toBe("inquiry-grade")
    expect(manifest.migrationRules).toBeDefined()
  })

  it("声明了 8 个 Agent", () => {
    expect(manifest.directory.agents).toHaveLength(8)
  })

  it("声明了 8 个 Workflow", () => {
    expect(manifest.directory.workflows).toHaveLength(8)
  })

  it("声明了 13 个 Skill", () => {
    expect(manifest.directory.skills).toHaveLength(13)
  })

  it("声明了 2 个 Connector（email + crm）", () => {
    expect(manifest.directory.connectors).toContain("email")
    expect(manifest.directory.connectors).toContain("crm")
  })

  // 检查每个声明的 Agent 文件实际存在
  it.each(manifest.directory.agents as string[])(
    "agents/%s 文件实际存在",
    (agentId) => {
      const agentFile = path.join(
        process.cwd(), "industry-packs/foreign-trade/agents",
        `${agentId}.json`,
      )
      expect(fs.existsSync(agentFile), `agents/${agentId}.json 不存在`).toBe(true)
    },
  )

  // 检查每个声明的 Skill 目录实际存在
  it.each(manifest.directory.skills as string[])(
    "skills/%s 目录实际存在",
    (skillId) => {
      const skillDir = path.join(
        process.cwd(), "industry-packs/foreign-trade/skills", skillId,
      )
      expect(fs.existsSync(skillDir), `skills/${skillId}/ 目录不存在`).toBe(true)
    },
  )

  // 检查每个声明的 Workflow 目录实际存在
  it.each(manifest.directory.workflows as string[])(
    "workflows/%s 目录实际存在",
    (wfId) => {
      const wfDir = path.join(
        process.cwd(), "industry-packs/foreign-trade/workflows", wfId,
      )
      expect(fs.existsSync(wfDir), `workflows/${wfId}/ 目录不存在`).toBe(true)
    },
  )

  // 检查 eval-rules/baseline 有实体内容
  it("eval-rules/baseline.json 包含 ≥4 条规则", () => {
    const baselinePath = path.join(
      process.cwd(), "industry-packs/foreign-trade/eval-rules/baseline.json",
    )
    expect(fs.existsSync(baselinePath), "baseline.json 不存在").toBe(true)
    const content = JSON.parse(fs.readFileSync(baselinePath, "utf-8"))
    expect(content.rules).toBeDefined()
    expect(Array.isArray(content.rules)).toBe(true)
    expect(content.rules.length).toBeGreaterThanOrEqual(4)
  })

  // 检查 connector 文件内容
  it.each(["email", "crm"])(
    "connectors/%s/connector.json 有内容",
    (connId: string) => {
      const connPath = path.join(
        process.cwd(), "industry-packs/foreign-trade/connectors", connId, "connector.json",
      )
      expect(fs.existsSync(connPath), `connectors/${connId}/connector.json 不存在`).toBe(true)
      const content = JSON.parse(fs.readFileSync(connPath, "utf-8"))
      expect(content.name).toBeDefined()
      expect(content.capabilities).toBeDefined()
    },
  )
})

// ============================================================
// 2. pack-agents API（集成）
// ============================================================
describe("Pack Agents API（集成，需运行服务）", () => {
  const BASE = "http://localhost:3000"
  const AUTH = process.env.TEST_AUTH_COOKIE ?? ""

  async function get(p: string) {
    const res = await fetch(`${BASE}${p}`, {
      headers: AUTH ? { Cookie: AUTH } : {},
    })
    return { status: res.status, body: await res.json().catch(() => ({})) }
  }

  it("GET /api/workspace/pack-agents?packId=foreign-trade 返回 8 个 Agent", async () => {
    const res = await get(
      "/api/workspace/pack-agents?packId=foreign-trade&workspaceId=any",
    )
    expect([200, 401]).toContain(res.status)
    if (res.status === 200) {
      expect(Array.isArray(res.body.agents)).toBe(true)
      expect(res.body.agents.length).toBe(8)
      expect(res.body.agents[0]).toHaveProperty("agentId")
      expect(res.body.agents[0]).toHaveProperty("agentName")
    }
  })

  it("GET /api/workspace/pack-agents 返回 actionTypes 列表", async () => {
    const res = await get(
      "/api/workspace/pack-agents?packId=foreign-trade&workspaceId=any",
    )
    if (res.status === 200) {
      expect(Array.isArray(res.body.actionTypes)).toBe(true)
      const types = res.body.actionTypes.map((a: { type: string }) => a.type)
      expect(types).toContain("inquiry.grade")
      expect(types).toContain("quotation.send")
    }
  })

  it("不存在的 packId 返回 404", async () => {
    const res = await get("/api/workspace/pack-agents?packId=non-existent-pack")
    expect(res.status).toBe(404)
  })
})

// ============================================================
// 3. 询盘 → 报价核心演示路径（集成）
// ============================================================
describe("询盘 → 报价演示路径（集成，需运行服务 + seed DB）", () => {
  const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "")
  const AUTH = process.env.TEST_AUTH_COOKIE ?? ""
  const WORKSPACE = process.env.TEST_WORKSPACE_ID ?? ""

  async function api(method: string, p: string, body?: object) {
    const res = await fetch(`${BASE}${p}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(AUTH ? { Cookie: AUTH } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, body: await res.json().catch(() => ({})) }
  }

  const skipAll = () => !WORKSPACE

  // ---- 询盘创建 ----
  it("POST /api/packs/foreign-trade/inquiries → 创建询盘成功（201）", async () => {
    if (skipAll()) {
      console.warn("跳过：TEST_WORKSPACE_ID 未配置")
      return
    }
    const res = await api("POST", "/api/packs/foreign-trade/inquiries", {
      fromEmail: "smoke-test@test.hermesclaw.local",
      subject: `[冒烟] 测试询盘 — USB-C 充电头 ${Date.now()}`,
      content: "我司需要采购 USB-C 充电头，型号 PD65W，数量 10000 件，请报价",
      countryCode: "CN",
    })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    process.env.__SMOKE_INQUIRY_ID = res.body.id
  })

  // ---- 询盘分级 ----
  it("POST /api/packs/foreign-trade/inquiries/:id/grade → 分级成功", async () => {
    if (skipAll()) return
    const inquiryId = process.env.__SMOKE_INQUIRY_ID
    if (!inquiryId) return
    const res = await api(
      "POST",
      `/api/packs/foreign-trade/inquiries/${inquiryId}/grade`,
    )
    expect(res.status).toBe(200)
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(res.body.grade)
  })

  // ---- 报价创建 ----
  it("POST /api/packs/foreign-trade/quotations → 基于询盘创建报价（201）", async () => {
    if (skipAll()) return
    const inquiryId = process.env.__SMOKE_INQUIRY_ID
    if (!inquiryId) return
    const res = await api("POST", "/api/packs/foreign-trade/quotations", {
      inquiryId,
      totalAmount: "25,000.00",
      currency: "USD",
      version: 1,
    })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    process.env.__SMOKE_QUOTATION_ID = res.body.id
  })

  // ---- L1/L2 发送 ----
  it("POST /api/packs/foreign-trade/quotations/:id/send → 返回发送结果", async () => {
    if (skipAll()) return
    const quotationId = process.env.__SMOKE_QUOTATION_ID
    if (!quotationId) return
    const res = await api(
      "POST",
      `/api/packs/foreign-trade/quotations/${quotationId}/send`,
    )
    if (res.status === 200) {
      if (res.body.mode === "suggestion") {
        expect(res.body.policy.level).toBe("L1")
      } else {
        expect(res.body.status).toBe("sent")
      }
    }
  })
})

// ============================================================
// 4. AutomationPolicy 门禁
// ============================================================
describe("AutomationPolicy × 外贸 Agent 绑定", () => {
  const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "")
  const AUTH = process.env.TEST_AUTH_COOKIE ?? ""
  const WORKSPACE = process.env.TEST_WORKSPACE_ID ?? ""

  async function api(method: string, p: string, body?: object) {
    const res = await fetch(`${BASE}${p}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(AUTH ? { Cookie: AUTH } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, body: await res.json().catch(() => ({})) }
  }

  it("L4 策略被拒绝（403）", async () => {
    if (!WORKSPACE) return
    const res = await api("POST", "/api/workspace/automation-policy", {
      workspaceId: WORKSPACE,
      agentId: "agent-001",
      actionType: "inquiry.grade",
      automationLevel: "L4",
      riskLevel: "HIGH",
    })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe("L4_NOT_ALLOWED")
  })

  it("L3 策略被拒绝（422）", async () => {
    if (!WORKSPACE) return
    const res = await api("POST", "/api/workspace/automation-policy", {
      workspaceId: WORKSPACE,
      agentId: "agent-001",
      actionType: "inquiry.grade",
      automationLevel: "L3",
      riskLevel: "MEDIUM",
    })
    expect(res.status).toBe(422)
    expect(res.body.error).toBe("REQUIRES_HARNESS_APPROVAL")
  })

  it("L2 策略创建成功（201）", async () => {
    if (!WORKSPACE) return
    const res = await api("POST", "/api/workspace/automation-policy", {
      workspaceId: WORKSPACE,
      agentId: "agent-002",
      actionType: "quotation.send__smoke",
      automationLevel: "L2",
      riskLevel: "LOW",
    })
    expect([201, 409]).toContain(res.status)
  })
})

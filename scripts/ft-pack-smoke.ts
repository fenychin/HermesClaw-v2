/**
 * 外贸 Pack 集成冒烟脚本
 *
 * 运行方式：
 *   BASE_URL=http://localhost:3000 \
 *   TEST_WORKSPACE_ID=<workspace-id> \
 *   TEST_AUTH_COOKIE=<session-cookie> \
 *   pnpm tsx scripts/ft-pack-smoke.ts
 *
 * 或：
 *   pnpm smoke:ft
 */
import fs from "fs"
import path from "path"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const WORKSPACE = process.env.TEST_WORKSPACE_ID ?? ""
const AUTH = process.env.TEST_AUTH_COOKIE ?? ""

interface Result {
  name: string
  ok: boolean
  detail?: string
}
const results: Result[] = []

const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`)
}

async function call(
  method: string,
  p: string,
  body?: object,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(AUTH ? { Cookie: AUTH } : {}),
      ...(extraHeaders ?? {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

async function run() {
  console.log("\n🌏 HermesClaw 外贸 Pack v1 集成冒烟测试")
  console.log("=".repeat(55))

  // ---- 1. Manifest 静态检查 ----
  console.log("\n[1] Manifest 静态检查")
  const mPath = path.join(process.cwd(), "industry-packs/foreign-trade/manifest.json")
  const ok = fs.existsSync(mPath)
  check("manifest.json 存在", ok)
  if (ok) {
    const m = JSON.parse(fs.readFileSync(mPath, "utf-8"))
    check("声明 8 个 Agent", m.directory?.agents?.length === 8,
      `实际: ${m.directory?.agents?.length}`)
    check("声明 13 个 Skill", m.directory?.skills?.length === 13,
      `实际: ${m.directory?.skills?.length}`)
    check("声明 2 个 Connector", m.directory?.connectors?.length === 2,
      `实际: ${m.directory?.connectors?.length}`)
    check("声明 entryWorkflow", m.entryWorkflow === "inquiry-grade",
      `值: ${m.entryWorkflow}`)

    // 检查 skill 目录存在
    const skillsDir = path.join(process.cwd(), "industry-packs/foreign-trade/skills")
    const skillDirnames = fs.existsSync(skillsDir)
      ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
      : []
    const missingSkills = (m.directory?.skills ?? []).filter(
      (s: string) => !skillDirnames.includes(s),
    )
    check(
      `所有声明 skill 目录存在（${skillDirnames.length}/13）`,
      missingSkills.length === 0,
      missingSkills.length ? `缺失: ${missingSkills.join(", ")}` : undefined,
    )
  }

  // ---- 2. Pack Agents API ----
  console.log("\n[2] Pack Agents API")
  const agentsRes = await call(
    "GET",
    "/api/workspace/pack-agents?packId=foreign-trade&workspaceId=any",
  )
  check("pack-agents 端点可访问", [200, 401].includes(agentsRes.status),
    `status=${agentsRes.status}`)
  if (agentsRes.status === 200) {
    const body = agentsRes.data as { agents?: unknown[]; actionTypes?: unknown[] }
    check("返回 8 个 Agent", (body.agents?.length ?? 0) === 8,
      `实际: ${body.agents?.length}`)
    check("返回 actionTypes 列表", Array.isArray(body.actionTypes),
      `count=${(body.actionTypes as unknown[])?.length}`)
  }

  // ---- 3. 询盘 → 报价演示路径 ----
  console.log("\n[3] 询盘 → 报价演示路径")
  if (!WORKSPACE) {
    console.log("  ⚠️  TEST_WORKSPACE_ID 未配置，跳过业务 API 测试")
  } else {
    // 3a. 创建询盘
    const inqRes = await call("POST", "/api/packs/foreign-trade/inquiries", {
      fromEmail: "smoke@test.hermesclaw.local",
      subject: `[冒烟] ${new Date().toISOString().slice(0, 19)} 测试询盘`,
      content: "冒烟测试询盘内容 — USB-C 充电头 10000 件",
      countryCode: "CN",
    })
    check("创建询盘 201", inqRes.status === 201,
      `status=${inqRes.status} error=${inResData(inqRes, "error")}`)
    const inquiryId = inqRes.data.id as string | undefined

    if (inquiryId) {
      // 3b. 询盘分级
      const gradeRes = await call(
        "POST",
        `/api/packs/foreign-trade/inquiries/${inquiryId}/grade`,
      )
      check("询盘分级 200", gradeRes.status === 200,
        `status=${gradeRes.status}`)
      check(
        "分级结果有效",
        ["HIGH", "MEDIUM", "LOW"].includes(gradeRes.data.grade as string),
        `grade=${gradeRes.data.grade}`,
      )

      // 3c. 创建报价
      const quoteRes = await call("POST", "/api/packs/foreign-trade/quotations", {
        inquiryId,
        totalAmount: "30,000.00",
        currency: "USD",
        version: 1,
      })
      check("创建报价 201", quoteRes.status === 201,
        `status=${quoteRes.status} error=${inResData(quoteRes, "error")}`)
      const quotationId = quoteRes.data.id as string | undefined

      if (quotationId) {
        // 3d. 发送报价
        const sendRes = await call(
          "POST",
          `/api/packs/foreign-trade/quotations/${quotationId}/send`,
        )
        const sendOk = sendRes.status === 200
        check("报价发送端点可访问", sendOk,
          `status=${sendRes.status} mode=${inResData(sendRes, "mode")}`)
        if (sendOk) {
          const mode = sendRes.data.mode === "suggestion" ? "L1-建议" : "L2-执行"
          console.log(`  └─ 发送模式: ${mode}`)
        }
      }
    }
  }

  // ---- 4. AutomationPolicy 门禁 ----
  console.log("\n[4] AutomationPolicy 外贸 Agent 绑定")
  if (WORKSPACE) {
    const l4Res = await call("POST", "/api/workspace/automation-policy", {
      workspaceId: WORKSPACE,
      agentId: "agent-001",
      actionType: "inquiry.grade",
      automationLevel: "L4",
      riskLevel: "CRITICAL",
    })
    check("L4 策略被拒绝（403）", l4Res.status === 403,
      `status=${l4Res.status} error=${inResData(l4Res, "error")}`)

    const l3Res = await call("POST", "/api/workspace/automation-policy", {
      workspaceId: WORKSPACE,
      agentId: "agent-001",
      actionType: "inquiry.grade",
      automationLevel: "L3",
      riskLevel: "HIGH",
    })
    check("L3 策略被拒绝（422）", l3Res.status === 422,
      `status=${l3Res.status} error=${inResData(l3Res, "error")}`)
  }

  // ---- 汇总 ----
  console.log("\n" + "=".repeat(55))
  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  console.log(`📊 ${passed}/${results.length} 通过`)
  if (failed.length) {
    console.log("\n❌ 失败项（优先修复）：")
    failed.forEach((r) =>
      console.log(`  - ${r.name}${r.detail ? ` (${r.detail})` : ""}`),
    )
  } else {
    console.log("\n🎉 全部通过！外贸 Pack v1 可演示状态就绪")
  }
  process.exit(failed.length ? 1 : 0)
}

/** 安全地从 API 响应 data 中取字段 */
function inResData(res: { data: Record<string, unknown> }, key: string): string {
  return (res.data[key] as string) ?? "N/A"
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})

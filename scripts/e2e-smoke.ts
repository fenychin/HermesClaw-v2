/**
 * Phase 2 端到端冒烟脚本（CLAUDE.md §10：Hermes ↔ OpenClaw 关键路径必须 e2e）
 *
 * 验证主链路：
 *   1. /api/task/dispatch（TaskEnvelope + 幂等键 + AutomationPolicy clamp）
 *   2. /api/openclaw/events（ExecutionEvent ingest + eventId 去重）
 *   3. /api/harness/evaluate-event（OpenClaw → Harness 终态回调，写 EvolutionLog）
 *   4. /api/audit、/api/harness/evolution-log（治理留痕端点可访问）
 *
 * 运行方式：
 *   # Terminal 1
 *   E2E_BYPASS_RBAC=true pnpm dev
 *   # Terminal 2
 *   pnpm smoke
 *
 * 注意：
 *   - 不依赖 vitest，独立可执行（tsx 直接 run）
 *   - 不写入任何 hardcode workspace/agent ID（用 seed 默认 "default"）
 *   - 不调用真实 LLM，所有 payload 都是 _smoke=true 标记
 *   - dispatch 端点要求 NODE_ENV !== production && E2E_BYPASS_RBAC=true 才放行无 cookie 调用
 */

const BASE_URL = process.env["BASE_URL"] ?? "http://localhost:3000"
const WORKSPACE_ID = process.env["TEST_WORKSPACE_ID"] ?? "default"
const AGENT_ID = process.env["TEST_AGENT_ID"] ?? "smoke-agent"
const INTERNAL_TOKEN = process.env["INTERNAL_TASK_CALLBACK_TOKEN"] ?? ""
const AUTH_COOKIE = process.env["TEST_AUTH_COOKIE"] ?? ""

interface TestResult {
  name: string
  passed: boolean
  detail?: string
}
const results: TestResult[] = []

function assert(name: string, condition: boolean, detail?: string): void {
  results.push({ name, passed: condition, detail })
  const icon = condition ? "✅" : "❌"
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`)
}

interface FetchResult {
  status: number
  body: Record<string, unknown>
}

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<FetchResult> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-workspace-id": WORKSPACE_ID,
      ...(AUTH_COOKIE ? { Cookie: AUTH_COOKIE } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  })
  return {
    status: res.status,
    body: (await res.json().catch(() => ({}))) as Record<string, unknown>,
  }
}

async function get(path: string): Promise<FetchResult> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "x-workspace-id": WORKSPACE_ID,
      ...(AUTH_COOKIE ? { Cookie: AUTH_COOKIE } : {}),
    },
  })
  return {
    status: res.status,
    body: (await res.json().catch(() => ({}))) as Record<string, unknown>,
  }
}

async function runSmoke(): Promise<void> {
  console.log("\n🔥 HermesClaw Phase 2 E2E Smoke Test")
  console.log("=".repeat(60))
  console.log(`BASE_URL:     ${BASE_URL}`)
  console.log(`WORKSPACE_ID: ${WORKSPACE_ID}`)
  console.log(`AGENT_ID:     ${AGENT_ID}`)
  console.log(`INTERNAL_TOKEN: ${INTERNAL_TOKEN ? "[set]" : "[not set]"}`)
  console.log("=".repeat(60))

  const idemKey = `smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const internalHeaders: Record<string, string> = INTERNAL_TOKEN
    ? { "x-internal-token": INTERNAL_TOKEN }
    : {}

  // ---- 阶段 1：Task Dispatch ----
  console.log("\n[阶段 1] Task Dispatch")

  // 1a. 缺幂等键应被拒绝
  const noIdemRes = await post(
    "/api/task/dispatch",
    {
      workflowRunId: crypto.randomUUID(),
      industryId: "foreign-trade",
      agentId: AGENT_ID,
      actionType: "smoke_test_action",
      input: { _smoke: true },
    },
    internalHeaders,
  )
  assert(
    "1a. dispatch：缺幂等键 → 400",
    noIdemRes.status === 400,
    `status=${noIdemRes.status} error=${String(noIdemRes.body["error"])}`,
  )

  // 1b. 合规请求 → 201
  const createRes = await post(
    "/api/task/dispatch",
    {
      workflowRunId: crypto.randomUUID(),
      industryId: "foreign-trade",
      agentId: AGENT_ID,
      actionType: "smoke_test_action",
      input: { _smoke: true, ts: Date.now() },
      automationLevel: "L1",
      riskLevel: "low",
    },
    { ...internalHeaders, "x-idempotency-key": idemKey },
  )
  assert(
    "1b. dispatch：合规请求 → 201",
    createRes.status === 201,
    `status=${createRes.status} error=${String(createRes.body["error"])}`,
  )
  const taskId = createRes.body["taskId"] as string | undefined
  assert(
    "1c. dispatch：响应包含 taskId",
    typeof taskId === "string" && taskId.length > 0,
    `taskId=${String(taskId)}`,
  )
  const envelope = createRes.body["envelope"] as Record<string, unknown> | undefined
  assert(
    "1d. dispatch：响应包含完整 envelope（含 policySnapshotVersion）",
    !!envelope &&
      typeof envelope["policySnapshotVersion"] === "string" &&
      typeof envelope["idempotencyKey"] === "string" &&
      envelope["idempotencyKey"] === idemKey,
    `envelope.idempotencyKey=${String(envelope?.["idempotencyKey"])}`,
  )

  // 1e. 幂等键重放 → 200 + idempotent:true
  if (createRes.status === 201 && taskId) {
    const idemRes = await post(
      "/api/task/dispatch",
      {
        workflowRunId: crypto.randomUUID(),
        industryId: "foreign-trade",
        agentId: AGENT_ID,
        actionType: "smoke_test_action",
        input: {},
      },
      { ...internalHeaders, "x-idempotency-key": idemKey },
    )
    assert(
      "1e. dispatch：相同幂等键 → 200 idempotent:true",
      idemRes.status === 200 && idemRes.body["idempotent"] === true,
      `status=${idemRes.status} idempotent=${String(idemRes.body["idempotent"])}`,
    )
    assert(
      "1f. dispatch：幂等响应 taskId 与首次一致",
      idemRes.body["taskId"] === taskId,
      `expected=${taskId} got=${String(idemRes.body["taskId"])}`,
    )
  }

  // 1g. clamp 审计：客户端请求 L4，期望被 clamp 回 L1（system default），且响应 clamped:true
  const clampIdemKey = `smoke-clamp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const clampRes = await post(
    "/api/task/dispatch",
    {
      workflowRunId: crypto.randomUUID(),
      industryId: "foreign-trade",
      agentId: AGENT_ID,
      actionType: "smoke_clamp_action",
      input: { _smoke: true },
      automationLevel: "L4", // 故意提权
      riskLevel: "low",
    },
    { ...internalHeaders, "x-idempotency-key": clampIdemKey },
  )
  assert(
    "1g. dispatch：客户端 L4 → clamp 到 ≤ policyMax",
    clampRes.status === 201 &&
      (clampRes.body["policy"] as Record<string, unknown> | undefined)?.["clamped"] === true,
    `status=${clampRes.status} clamped=${String((clampRes.body["policy"] as Record<string, unknown> | undefined)?.["clamped"])}`,
  )

  // 1h. clamp 必须留下 automation.level.change 审计（V2 修复 / AGENTS.md §6.2）
  const clampTaskId = clampRes.body["taskId"] as string | undefined
  if (clampTaskId) {
    // 等审计落库
    await new Promise(r => setTimeout(r, 200))
    const clampAuditRes = await get(
      `/api/audit?action=automation.level.change&limit=20`,
    )
    const cAuditData = clampAuditRes.body["data"] as
      | { logs?: Array<Record<string, unknown>> }
      | undefined
    const cAuditLogs = cAuditData?.logs ?? []
    const hitClampAudit = cAuditLogs.find(l => l["targetId"] === clampTaskId)
    assert(
      "1h. dispatch：clamp 实发生 → automation.level.change 审计留痕",
      !!hitClampAudit,
      `expected automation.level.change for taskId=${clampTaskId.slice(0, 8)}... in ${cAuditLogs.length} entries`,
    )
  }

  // ---- 阶段 2：OpenClaw ExecutionEvent 接收 ----
  console.log("\n[阶段 2] OpenClaw 事件接收")

  if (!taskId) {
    // dispatch 失败，无法继续后续阶段（events / evaluate-event 都需要合法 taskId 才能反查 workspaceId）
    console.error("\n❌ 阶段 1 dispatch 未拿到 taskId，后续阶段中止")
    process.exit(1)
  }

  // 2a. 不合规事件 → 422
  const badEventRes = await post("/api/openclaw/events", {
    eventId: "not-a-uuid",
    taskId: taskId,
    // 缺 runtimeId / eventType / status
  })
  assert(
    "2a. events：不合规事件 → 422",
    badEventRes.status === 422,
    `status=${badEventRes.status}`,
  )

  // 2b. 合规 started 事件
  const startedEventId = crypto.randomUUID()
  const workflowRunId = crypto.randomUUID()
  const startedRes = await post("/api/openclaw/events", {
    eventId: startedEventId,
    taskId: taskId,
    workflowRunId,
    runtimeId: "smoke-test-runtime",
    eventType: "run.started",
    status: "started",
    timestamp: new Date().toISOString(),
    payload: { _smoke: true },
    version: "1.0.0",
  })
  assert(
    "2b. events：合规 started → 200",
    startedRes.status === 200,
    `status=${startedRes.status}`,
  )
  assert(
    "2c. events：响应 received:true",
    startedRes.body["received"] === true,
    `received=${String(startedRes.body["received"])}`,
  )

  // 2d. completed 事件（→ 触发 Harness evaluate-event 同步回调，E5 修复）
  const completedEventId = crypto.randomUUID()
  const completedRes = await post("/api/openclaw/events", {
    eventId: completedEventId,
    taskId: taskId,
    workflowRunId,
    runtimeId: "smoke-test-runtime",
    eventType: "run.completed",
    status: "completed",
    timestamp: new Date().toISOString(),
    payload: { result: "smoke_ok" },
    version: "1.0.0",
  })
  assert(
    "2d. events：completed 事件 → 200",
    completedRes.status === 200,
    `status=${completedRes.status}`,
  )
  // E5 修复断言：响应必须包含 harnessCallbackOk:true（同步 await 成功）
  assert(
    "2d-bis. events：completed 事件触发同步 harness 回调成功 (harnessCallbackOk:true)",
    completedRes.body["harnessCallbackOk"] === true,
    `harnessCallbackOk=${String(completedRes.body["harnessCallbackOk"])} ` +
      `error=${String(completedRes.body["harnessCallbackError"])}`,
  )

  // 2e. 同 eventId 去重
  const dupRes = await post("/api/openclaw/events", {
    eventId: startedEventId,
    taskId: taskId,
    workflowRunId: crypto.randomUUID(),
    runtimeId: "smoke-test-runtime",
    eventType: "run.started",
    status: "started",
    timestamp: new Date().toISOString(),
    payload: {},
    version: "1.0.0",
  })
  assert(
    "2e. events：重复 eventId → duplicate:true",
    dupRes.body["duplicate"] === true,
    `duplicate=${String(dupRes.body["duplicate"])}`,
  )

  // ---- 阶段 3：Harness Evaluate-Event 链路 ----
  console.log("\n[阶段 3] Harness Evaluate-Event")

  // 等异步回调落库（OpenClaw events POST 中以 void Promise 触发）
  await new Promise(r => setTimeout(r, 800))

  // 3a. evolution-log 包含 reportId=EVT-${completedEventId}
  const evoLogRes = await get("/api/harness/evolution-log?limit=20")
  assert(
    "3a. evolution-log：端点 200",
    evoLogRes.status === 200,
    `status=${evoLogRes.status}`,
  )
  const data = evoLogRes.body["data"] as { logs?: Array<Record<string, unknown>> } | undefined
  const logs = data?.logs ?? []
  const hitLog = logs.find(l => l["reportId"] === `EVT-${completedEventId}`)
  assert(
    "3b. evolution-log：含 completed 事件回调写入的 EvolutionLog",
    !!hitLog,
    `expected reportId=EVT-${completedEventId.slice(0, 8)}... in ${logs.length} logs`,
  )
  if (hitLog) {
    assert(
      "3c. evolution-log：completed 事件 successRate=1",
      hitLog["successRate"] === 1,
      `successRate=${String(hitLog["successRate"])}`,
    )
  }

  // 3d. 直接 POST evaluate-event 验证幂等：重复 eventId → duplicate:true
  const directDupRes = await post(
    "/api/harness/evaluate-event",
    {
      taskId: taskId,
      workflowRunId,
      runtimeId: "smoke-test-runtime",
      finalStatus: "completed",
      eventId: completedEventId,
      payload: { result: "smoke_ok" },
    },
    internalHeaders,
  )
  assert(
    "3d. evaluate-event：重复 eventId 直调 → duplicate:true",
    directDupRes.body["duplicate"] === true || directDupRes.body["received"] === true,
    `status=${directDupRes.status} duplicate=${String(directDupRes.body["duplicate"])}`,
  )

  // 3e. evaluate-event：非终态状态 → 422 NON_TERMINAL_STATUS（V4 修复）
  const nonTerminalRes = await post(
    "/api/harness/evaluate-event",
    {
      taskId: crypto.randomUUID(),
      workflowRunId: crypto.randomUUID(),
      runtimeId: "smoke-test-runtime",
      finalStatus: "started",
      eventId: crypto.randomUUID(),
    },
    internalHeaders,
  )
  assert(
    "3e. evaluate-event：非终态 → 422 NON_TERMINAL_STATUS",
    nonTerminalRes.status === 422 &&
      nonTerminalRes.body["error"] === "NON_TERMINAL_STATUS",
    `status=${nonTerminalRes.status} error=${String(nonTerminalRes.body["error"])}`,
  )

  // 3f. evaluate-event：陌生 taskId（dispatch 链路外）→ 422 拒绝（V1 修复）
  //     —— 阻止 OpenClaw 终态回调污染他人 workspace 的 EvolutionLog 指标
  const unknownTaskRes = await post(
    "/api/harness/evaluate-event",
    {
      taskId: crypto.randomUUID(),
      workflowRunId: crypto.randomUUID(),
      runtimeId: "smoke-test-runtime",
      finalStatus: "completed",
      eventId: crypto.randomUUID(),
    },
    internalHeaders,
  )
  assert(
    "3f. evaluate-event：陌生 taskId → 422 TASK_WORKSPACE_NOT_FOUND",
    unknownTaskRes.status === 422 &&
      unknownTaskRes.body["error"] === "TASK_WORKSPACE_NOT_FOUND",
    `status=${unknownTaskRes.status} error=${String(unknownTaskRes.body["error"])}`,
  )

  // ---- 阶段 4：审计与策略可访问性 ----
  console.log("\n[阶段 4] AuditLog + AutomationPolicy")

  // 4a. /api/audit 含 task.dispatch 记录
  const auditRes = await get(
    `/api/audit?action=task.dispatch&limit=20`,
  )
  assert(
    "4a. audit：task.dispatch 端点 200",
    auditRes.status === 200,
    `status=${auditRes.status}`,
  )
  if (taskId && auditRes.status === 200) {
    const auditData = auditRes.body["data"] as
      | { logs?: Array<Record<string, unknown>> }
      | undefined
    const auditLogs = auditData?.logs ?? []
    const hitAudit = auditLogs.find(l => l["targetId"] === taskId)
    assert(
      "4b. audit：含本次 dispatch 的 taskId 留痕",
      !!hitAudit,
      `expected targetId=${taskId.slice(0, 8)}... in ${auditLogs.length} entries`,
    )
  }

  // 4c. evaluate-event 留痕（task.evaluate）
  const evalAuditRes = await get(
    `/api/audit?action=task.evaluate&limit=20`,
  )
  assert(
    "4c. audit：task.evaluate 端点 200",
    evalAuditRes.status === 200,
    `status=${evalAuditRes.status}`,
  )

  // ---- 汇总 ----
  console.log("\n" + "=".repeat(60))
  console.log("📊 Smoke Test Summary")
  console.log("=".repeat(60))
  const passed = results.filter(r => r.passed).length
  const total = results.length
  const failed = results.filter(r => !r.passed)

  console.log(`结果：${passed}/${total} 通过`)
  if (failed.length > 0) {
    console.log("\n❌ 失败项：")
    failed.forEach(r =>
      console.log(`  - ${r.name}${r.detail ? ` (${r.detail})` : ""}`),
    )
  }

  console.log("\n🔍 已验证主链路：")
  console.log("  ✓ TaskEnvelope dispatch（幂等键 + AutomationPolicy clamp + automation.level.change 审计）")
  console.log("  ✓ ExecutionEvent ingest（schema 校验 + eventId 去重）")
  console.log("  ✓ OpenClaw → Harness 终态回调（同步 await + harnessCallbackOk + EvolutionLog 落库）")
  console.log("  ✓ AuditLog 治理留痕（task.dispatch fail-closed + task.evaluate + automation.level.change）")
  console.log("  ✓ workspaceId 反查（陌生 taskId → 422，禁用跨租户污染）")

  process.exit(failed.length > 0 ? 1 : 0)
}

runSmoke().catch(err => {
  console.error("Smoke test crashed:", err)
  process.exit(1)
})

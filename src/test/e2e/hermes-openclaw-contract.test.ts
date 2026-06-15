/**
 * Hermes ↔ OpenClaw 契约 e2e 测试（in-process 集成）
 *
 * CLAUDE.md §10：Hermes ↔ OpenClaw 关键路径必须有 e2e 测试。
 *
 * 本测试以 in-process 方式直接 import Next.js Route Handler，避免起 dev server：
 *   - 通过 vi.mock 让 RBAC 直通 MEMBER 角色
 *   - 使用真实 prisma（dev.db），通过随机前缀 + afterEach 清理保证幂等
 *   - 端到端验证：TaskEnvelope 派发 → 幂等键命中 → ExecutionEvent 接收 → 去重
 *
 * 7 个用例覆盖：
 *   ① 缺失幂等键 → 400
 *   ② 合规 envelope → 201 + taskId
 *   ③ 同幂等键重放 → 200 + idempotent:true + 同 taskId
 *   ④ 不合规 ExecutionEvent → 422
 *   ⑤ 合规 ExecutionEvent → 200 + 入库
 *   ⑥ 同 eventId 重放 → 200 + duplicate:true
 *   ⑦ task.dispatch 写 AuditLog 留痕
 */
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest"

// ── 全局 mock：RBAC 直通 MEMBER 角色 ──────────────────────────────
vi.mock("@/lib/workspace", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workspace")>("@/lib/workspace")
  return {
    ...actual,
    buildWorkspaceContext: vi.fn(async () => ({
      workspaceId: "default",
      role: "MEMBER" as const,
      userId: "test-user",
    })),
  }
})

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({
    user: {
      id: "test-user",
      name: "test",
      email: "test@example.com",
      role: "MEMBER",
    },
  })),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

// ── 测试数据：用 testRunId 前缀隔离，便于 afterEach 清理 ─────────
const testRunId = `e2etest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

let envelopePost: typeof import("@/app/api/tasks/envelope/route").POST
let openclawPost: typeof import("@/app/api/openclaw/events/route").POST
let prisma: typeof import("@/lib/prisma").prisma

beforeAll(async () => {
  // 动态 import 让 vi.mock 先生效
  ;({ POST: envelopePost } = await import("@/app/api/tasks/envelope/route"))
  ;({ POST: openclawPost } = await import("@/app/api/openclaw/events/route"))
  ;({ prisma } = await import("@/lib/prisma"))

  // 确保 default workspace 存在（dev.db 通常已 seed，幂等 upsert）
  await prisma.workspace.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", name: "Default" },
  })
})

afterEach(async () => {
  // 清理本测试 run 写入的幂等键、事件、审计
  await prisma.idempotencyKey.deleteMany({
    where: { key: { startsWith: testRunId } },
  })
  await prisma.executionEventLog.deleteMany({
    where: { eventId: { startsWith: testRunId } },
  })
  await prisma.auditLog.deleteMany({
    where: { detail: { contains: testRunId } },
  })
  // 同时清理 contextSnapshot 中包含 testRunId 的审计（task.dispatch 用 actionType 命名）
  await prisma.auditLog.deleteMany({
    where: { targetId: { startsWith: "t-" }, action: "task.dispatch" },
  })
})

/** 构造一个最小化合规 envelope 请求体 */
function makeEnvelopeBody(overrides: Record<string, unknown> = {}) {
  return {
    workflowRunId: `wf-${testRunId}`,
    industryId: "generic",
    agentId: "agent-001",
    actionType: `test.${testRunId}.dispatch`,
    input: { foo: "bar" },
    automationLevel: "L1",
    riskLevel: "low",
    ...overrides,
  }
}

/** 构造一个 NextRequest（用 Web Request + url 即可，Next 16 兼容） */
function makeRequest(
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: unknown },
): Request {
  return new Request(url, {
    method: init.method,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
}

// ── 测试套件 ──────────────────────────────────────────────────────
describe("Hermes ↔ OpenClaw Contract E2E", () => {
  // ① 缺失幂等键 → 400
  it("POST /api/tasks/envelope 应拒绝缺少 x-idempotency-key 的请求", async () => {
    const req = makeRequest("http://localhost/api/tasks/envelope", {
      method: "POST",
      body: makeEnvelopeBody(),
    })
    const res = await envelopePost(req, undefined as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("MISSING_IDEMPOTENCY_KEY")
  })

  // ② 合规 envelope → 201 + taskId
  it("POST /api/tasks/envelope 应成功创建合规 TaskEnvelope", async () => {
    const idempotencyKey = `${testRunId}-create`
    const req = makeRequest("http://localhost/api/tasks/envelope", {
      method: "POST",
      headers: { "x-idempotency-key": idempotencyKey },
      body: makeEnvelopeBody(),
    })
    const res = await envelopePost(req, undefined as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.idempotent).toBe(false)
    expect(body.data.taskId).toMatch(/^t-/)
  })

  // ③ 同幂等键重放 → 200 + idempotent + 同 taskId
  it("POST /api/tasks/envelope 相同幂等键重复请求应返回 200 且 taskId 不变", async () => {
    const idempotencyKey = `${testRunId}-replay`
    const body = makeEnvelopeBody()

    const res1 = await envelopePost(
      makeRequest("http://localhost/api/tasks/envelope", {
        method: "POST",
        headers: { "x-idempotency-key": idempotencyKey },
        body,
      }),
      undefined as never,
    )
    const body1 = await res1.json()
    expect(res1.status).toBe(201)
    const taskId = body1.data.taskId

    const res2 = await envelopePost(
      makeRequest("http://localhost/api/tasks/envelope", {
        method: "POST",
        headers: { "x-idempotency-key": idempotencyKey },
        body,
      }),
      undefined as never,
    )
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2.idempotent).toBe(true)
    expect(body2.data.taskId).toBe(taskId)
  })

  // ④ 不合规 ExecutionEvent → 422
  it("POST /api/openclaw/events 应拒绝不合规 ExecutionEvent", async () => {
    const req = makeRequest("http://localhost/api/openclaw/events", {
      method: "POST",
      body: {
        eventId: "not-empty-but-missing-others",
        // 故意缺少 taskId / workflowRunId / runtimeId / eventType / status / timestamp / version
      },
    })
    const res = await openclawPost(req as never)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe("INVALID_EXECUTION_EVENT")
    expect(Array.isArray(body.issues)).toBe(true)
  })

  // ⑤ 合规 ExecutionEvent → 200 + 入库
  it("POST /api/openclaw/events 应成功接收并落库合规 ExecutionEvent", async () => {
    const eventId = `${testRunId}-evt-1`
    const req = makeRequest("http://localhost/api/openclaw/events", {
      method: "POST",
      body: {
        eventId,
        taskId: `t-${testRunId}-1`,
        workflowRunId: `wf-${testRunId}-1`,
        runtimeId: "openclaw-test-runtime",
        eventType: "run.started",
        status: "started",
        timestamp: "2026-06-15T00:00:00.000Z",
        payload: { info: "test" },
        version: "1.0.0",
      },
    })
    const res = await openclawPost(req as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.received).toBe(true)
    expect(body.duplicate).toBe(false)

    const persisted = await prisma.executionEventLog.findUnique({
      where: { eventId },
    })
    expect(persisted).not.toBeNull()
    expect(persisted?.eventType).toBe("run.started")
  })

  // ⑥ 同 eventId 重放 → 200 + duplicate:true
  it("POST /api/openclaw/events 相同 eventId 重复提交应返回 duplicate:true", async () => {
    const eventId = `${testRunId}-evt-dup`
    const event = {
      eventId,
      taskId: `t-${testRunId}-dup`,
      workflowRunId: `wf-${testRunId}-dup`,
      runtimeId: "openclaw-test-runtime",
      eventType: "run.completed",
      status: "completed",
      timestamp: "2026-06-15T00:00:01.000Z",
      payload: {},
      version: "1.0.0",
    }
    await openclawPost(
      makeRequest("http://localhost/api/openclaw/events", {
        method: "POST",
        body: event,
      }) as never,
    )
    const res2 = await openclawPost(
      makeRequest("http://localhost/api/openclaw/events", {
        method: "POST",
        body: event,
      }) as never,
    )
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2.duplicate).toBe(true)
  })

  // ⑦ task.dispatch 写 AuditLog
  it("task.dispatch 事件应写入 AuditLog 留痕", async () => {
    const idempotencyKey = `${testRunId}-audit`
    const res = await envelopePost(
      makeRequest("http://localhost/api/tasks/envelope", {
        method: "POST",
        headers: { "x-idempotency-key": idempotencyKey },
        body: makeEnvelopeBody(),
      }),
      undefined as never,
    )
    const body = await res.json()
    expect(res.status).toBe(201)

    const taskId = body.data.taskId
    const auditEntries = await prisma.auditLog.findMany({
      where: { action: "task.dispatch", targetId: taskId },
    })
    expect(auditEntries.length).toBeGreaterThan(0)
    expect(auditEntries[0].status).toBe("success")
  })
})

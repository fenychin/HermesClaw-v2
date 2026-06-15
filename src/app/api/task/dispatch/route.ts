/**
 * POST /api/task/dispatch —— TaskEnvelope dispatch 端点
 *
 * 与 /api/task（快捷 LLM 任务）严格分离：
 *   - /api/task          产品快捷卡片入口（taskType + input → LLM 文本）
 *   - /api/task/dispatch 控制核心 dispatch 入口（TaskEnvelope → OpenClaw runtime）
 *
 * 流程（对齐 CLAUDE.md §9 开发顺序约束 + AGENTS.md §3.3 / §3.4）：
 *   1. 读取 `x-idempotency-key`，无则 400 拒绝
 *   2. 命中已有幂等键 → 200 + idempotent:true + 原 taskId（不重新校验 body）
 *   3. 解析 + zod 校验请求体（最小入口集，再补 envelope 必备字段后整体过 TaskEnvelopeSchema）
 *   4. 三级回退解析 AutomationPolicy，并 clamp 客户端 automationLevel
 *   5. 读取 policySnapshotVersion，组装完整 TaskEnvelope，过 schema 终校
 *   6. 落 IdempotencyKey、写 AuditLog(action='task.dispatch')、返回 201 + taskId + envelope
 *
 * 不在此处做：
 *   - 真正的 OpenClaw 执行（由 runtime 通过 callbackTarget 自行回流 ExecutionEvent）
 *   - LLM 调用（这是 /api/task 的职责）
 *   - 任务历史查询（属于 /api/tasks 系列）
 */
import { z } from "zod"
import { withRBAC } from "@/lib/server/shared/api-handler"
import { buildWorkspaceContext, type WorkspaceContext } from "@/lib/workspace"
import {
  TaskEnvelopeSchema,
  AutomationLevelSchema,
  RiskLevelSchema,
  CONTRACT_VERSION,
  type TaskEnvelope,
} from "@hermesclaw/event-contracts"
import {
  checkIdempotencyKey,
  storeIdempotencyKey,
  readIdempotencyKey,
} from "@/lib/idempotency"
import {
  resolveAutomationPolicy,
  clampAutomationLevel,
  type ResolvedPolicy,
} from "@/lib/automation/policy-resolver"
import { getCurrentPolicySnapshotVersion } from "@/lib/policy-snapshot"
import { writeAuditLog, createAuditEntry, updateAuditEntry } from "@/lib/server/shared/audit"
import { logger } from "@/lib/logger"
import { rateLimit } from "@/lib/rate-limit"
import { checkInternalToken } from "@/lib/server/shared/internal-auth"

export const runtime = "nodejs"

/**
 * 入口请求体 schema —— 客户端只需传"业务最小集"，其余 envelope 字段由服务端补齐：
 *   - taskId / version 服务端生成
 *   - policySnapshotVersion 服务端读取
 *   - automationLevel / riskLevel 服务端用 policy clamp 后回填
 */
const DispatchRequestSchema = z.object({
  workflowRunId: z.string().min(1),
  industryId: z.string().min(1),
  agentId: z.string().min(1),
  actionType: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  /** 客户端期望的 automationLevel；未传则用 policy 解析结果 */
  automationLevel: AutomationLevelSchema.optional(),
  /** 客户端声明的 riskLevel；未传则用 policy 解析结果 */
  riskLevel: RiskLevelSchema.optional(),
  /** 执行结果回调目标（topic / url / 队列名） */
  callbackTarget: z.string().min(1).optional(),
})

export const POST = async (request: Request): Promise<Response> => {
  // E2E 旁路：仅在显式开启 E2E_BYPASS_RBAC=true 且非 production 时绕过 RBAC，
  // 并要求请求头 x-internal-token 与 INTERNAL_TASK_CALLBACK_TOKEN 一致（若已配）。
  // 这是为冒烟脚本与 CI 设计的最小桥接，生产部署 **必须** 关闭该开关。
  const isE2EBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_BYPASS_RBAC === "true"

  if (isE2EBypass) {
    const auth = checkInternalToken(request.headers, { productionGuard: false })
    if (!auth.ok) {
      return Response.json({ error: auth.reason }, { status: auth.status })
    }
    const ctx = await buildWorkspaceContext(request)
    return handleDispatch(request, {
      ...ctx,
      // 在旁路模式下统一抬升为 MEMBER，绕过 RBAC 但保留 workspace 隔离与审计
      role: "MEMBER",
    })
  }

  return withRBACWrapped(request, undefined as never)
}

const withRBACWrapped = withRBAC(handleDispatch, "MEMBER")

async function handleDispatch(
  request: Request,
  ctx: WorkspaceContext,
): Promise<Response> {
  // 频率限制：dispatch 是写操作，每分钟 30 次 / IP
  const ip = request.headers.get("x-forwarded-for") || "unknown"
  if (!rateLimit(`task-dispatch:${ip}`, 30, 60_000)) {
    return Response.json({ error: "请求过于频繁" }, { status: 429 })
  }

  // 1. 幂等键必填
  const idemKey = readIdempotencyKey(request)
  if (!idemKey) {
    return Response.json(
      { error: "MISSING_IDEMPOTENCY_KEY", message: "缺少 x-idempotency-key 请求头" },
      { status: 400 },
    )
  }

  // 2. 命中既有幂等键直接返回原 taskId
  const hit = await checkIdempotencyKey(ctx.workspaceId, idemKey)
  if (hit) {
    return Response.json(
      { idempotent: true, taskId: hit.taskId },
      { status: 200 },
    )
  }

  // 3. 解析 + 校验入口请求体
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json(
      { error: "INVALID_JSON", message: "请求体必须是合法 JSON" },
      { status: 400 },
    )
  }
  const parsed = DispatchRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_DISPATCH_REQUEST", issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const body = parsed.data

  // 4. AutomationPolicy 三级回退 + clamp（E1 修复：加 try/catch 防御 DB 连接故障）
  let policy: ResolvedPolicy
  try {
    policy = await resolveAutomationPolicy(
      ctx.workspaceId,
      body.agentId,
      body.actionType,
    )
  } catch (error) {
    logger.error("[task/dispatch] resolveAutomationPolicy 异常", {
      workspaceId: ctx.workspaceId,
      agentId: body.agentId,
      actionType: body.actionType,
      error: error instanceof Error ? error.message : String(error),
    })
    // 治理故障时拒绝派发（fail-closed），不放行无策略的盲目操作
    return Response.json(
      { error: "POLICY_ENGINE_ERROR", message: "策略引擎不可用，请稍后重试" },
      { status: 503 },
    )
  }
  const effectiveAutomationLevel = body.automationLevel
    ? clampAutomationLevel(body.automationLevel, policy.automationLevel)
    : policy.automationLevel
  const effectiveRiskLevel = body.riskLevel ?? policy.riskLevel

  // 5. 组装完整 TaskEnvelope 并过 schema 终校
  const taskId = crypto.randomUUID()
  const policySnapshotVersion = await getCurrentPolicySnapshotVersion(
    ctx.workspaceId,
    body.agentId,
  )
  const envelopeCandidate = {
    taskId,
    workflowRunId: body.workflowRunId,
    workspaceId: ctx.workspaceId,
    industryId: body.industryId,
    agentId: body.agentId,
    actionType: body.actionType,
    input: body.input,
    automationLevel: effectiveAutomationLevel,
    riskLevel: effectiveRiskLevel,
    idempotencyKey: idemKey,
    callbackTarget: body.callbackTarget ?? "topic:task.result",
    policySnapshotVersion,
    version: CONTRACT_VERSION,
  }

  const envelopeParsed = TaskEnvelopeSchema.safeParse(envelopeCandidate)
  if (!envelopeParsed.success) {
    // 服务端拼装却过不了 schema = 内部 bug，需立即上报
    logger.error("[task/dispatch] envelope 终校失败（内部 bug）", {
      issues: envelopeParsed.error.issues,
      workspaceId: ctx.workspaceId,
    })
    return Response.json(
      {
        error: "INVALID_TASK_ENVELOPE",
        issues: envelopeParsed.error.issues,
      },
      { status: 422 },
    )
  }
  const envelope: TaskEnvelope = envelopeParsed.data

  // 6. fail-closed 审计预记录 → 落幂等键 → clamp 副审计 → 主审计转 success
  //    E3 修复：审计预记录失败 = 治理留痕丢失 = 拒绝派发；不再 fail-open。
  //    AGENTS.md §6.2 + §1.3：task.dispatch 必须可溯源，留痕不能丢。
  const wasClamped =
    body.automationLevel !== undefined &&
    effectiveAutomationLevel !== body.automationLevel

  const auditEntry = await createAuditEntry({
    actor: ctx.userId ?? "system",
    action: "task.dispatch",
    targetType: "task",
    targetId: taskId,
    detail:
      `agent=${body.agentId} action=${body.actionType} ` +
      `level=${effectiveAutomationLevel} risk=${effectiveRiskLevel} ` +
      `policySource=${policy.source}` +
      (wasClamped ? ` clamped=${body.automationLevel}->${effectiveAutomationLevel}` : ""),
    // AuditLog 自身的 riskLevel 用 low|medium|high；contract 的 critical 上抬为 high
    riskLevel: effectiveRiskLevel === "critical" ? "high" : effectiveRiskLevel,
    workspaceId: ctx.workspaceId,
    automationLevel: effectiveAutomationLevel,
    triggeredBy: ctx.userId ? "user" : "system",
    contextSnapshot: {
      requestedAutomationLevel: body.automationLevel ?? null,
      requestedRiskLevel: body.riskLevel ?? null,
      effectiveAutomationLevel,
      effectiveRiskLevel,
      policySource: policy.source,
      policySnapshotVersion,
      clamped: wasClamped,
      idempotencyKey: idemKey,
      industryId: body.industryId,
      agentId: body.agentId,
      actionType: body.actionType,
    },
  })

  if (!auditEntry.ok) {
    logger.error("[task/dispatch] 审计预记录失败，按 fail-closed 拒绝派发", {
      taskId,
      workspaceId: ctx.workspaceId,
      idempotencyKey: idemKey,
    })
    return Response.json(
      {
        error: "AUDIT_PRECORD_FAILED",
        message: "审计预记录失败，治理留痕丢失，已拒绝派发（请重试）",
      },
      { status: 503 },
    )
  }

  // V2 修复：clamp 实发生时单独写一条 automation.level.change 审计（AGENTS.md §6.2）
  //    与"工作区策略表配置变更"语义区分：targetType=task 表示这是单次 dispatch 的 clamp 留痕。
  if (wasClamped) {
    await writeAuditLog({
      actor: ctx.userId ?? "system",
      action: "automation.level.change",
      targetType: "task",
      targetId: taskId,
      detail:
        `dispatch clamp ${body.automationLevel} → ${effectiveAutomationLevel} ` +
        `agent=${body.agentId} action=${body.actionType} policySource=${policy.source}`,
      // L3/L4 试探被 clamp 视为 high（§6.2 特别提及 L3/L4）
      riskLevel:
        body.automationLevel === "L3" || body.automationLevel === "L4"
          ? "high"
          : "medium",
      workspaceId: ctx.workspaceId,
    })
  }

  // 落幂等键（审计预记录已成功，开始有副作用的写入）
  await storeIdempotencyKey({
    workspaceId: ctx.workspaceId,
    key: idemKey,
    taskId,
    scope: "/api/task/dispatch",
  })

  // 审计转 success
  await updateAuditEntry({
    auditId: auditEntry.auditId,
    status: "success",
  })

  return Response.json(
    {
      taskId,
      envelope,
      policy: {
        source: policy.source,
        clamped: wasClamped,
        effectiveAutomationLevel,
        effectiveRiskLevel,
      },
    },
    { status: 201 },
  )
}

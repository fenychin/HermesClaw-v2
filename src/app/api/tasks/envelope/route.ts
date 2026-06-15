/**
 * POST /api/tasks/envelope —— Hermes → OpenClaw 任务派发入口（契约合规版）
 *
 * AGENTS.md §3.3：跨域调用必须经 TaskEnvelope；本端点只接收符合
 * `TaskEnvelopeSchema` 的请求体（外加 `x-idempotency-key` 头）并完成：
 *
 *   1. 幂等键校验（重复键直接返回缓存的 taskId）
 *   2. 输入字段校验（仅校验 envelope 业务字段，taskId / version / policySnapshotVersion
 *      /idempotencyKey 由服务端注入或来自请求头，不允许客户端伪造 taskId）
 *   3. 注入 policySnapshotVersion（来自当前 workspace 的 Harness Bundle）
 *   4. 构造合规 TaskEnvelope，落 IdempotencyKey 表，写 AuditLog (`task.dispatch`)
 *   5. 返回 { taskId } —— 真正的执行交给 OpenClaw runtime（异步）
 *
 * RBAC：MEMBER+ —— 派发任务属于写操作。
 *
 * 与 /api/task （LLM 快捷任务）和 /api/tasks（UI 任务列表 CRUD）职责不重叠：
 *   - /api/tasks/envelope ←→ Hermes → OpenClaw 契约面（本文件）
 *   - /api/task          ←→ 同步 LLM 快捷调用（不写 Task 表）
 *   - /api/tasks         ←→ UI 工作台任务列表（业务实体表 Task）
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import {
  TaskEnvelopeSchema,
  TASK_ENVELOPE_VERSION,
  AutomationLevelSchema,
  RiskLevelSchema,
} from "@hermesclaw/event-contracts"
import { withRBAC } from "@/lib/server/shared/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import {
  checkIdempotencyKey,
  storeIdempotencyKey,
  readIdempotencyKey,
} from "@/lib/idempotency"
import { getCurrentPolicySnapshotVersion } from "@/lib/policy-snapshot"
import {
  createAuditEntry,
  updateAuditEntry,
  actorFromSession,
} from "@/lib/server/shared/audit"
import { findApprovedProposalForAction } from "@/lib/server/repositories/automation-policy"
import {
  resolveAutomationPolicy,
  clampAutomationLevel,
  LEVEL_RANK,
} from "@/lib/automation/policy-resolver"
import { logger } from "@/lib/logger"

/**
 * 请求体 schema —— 客户端只允许传业务字段；
 * `taskId` / `version` / `policySnapshotVersion` 由服务端注入；
 * `idempotencyKey` 来自 `x-idempotency-key` 头部。
 */
const EnvelopeRequestSchema = z.object({
  workflowRunId: z.string().min(1, "workflowRunId 必填"),
  industryId: z.string().min(1, "industryId 必填"),
  agentId: z.string().min(1, "agentId 必填"),
  actionType: z.string().min(1, "actionType 必填"),
  input: z.record(z.string(), z.unknown()),
  automationLevel: AutomationLevelSchema.default("L1"),
  riskLevel: RiskLevelSchema.default("low"),
  callbackTarget: z.string().min(1).default("internal:hermes/callback"),
})

const SCOPE = "/api/tasks/envelope"

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  // ── 1. 幂等键校验 ───────────────────────────────────────────────
  const idempotencyKey = readIdempotencyKey(request)
  if (!idempotencyKey) {
    return NextResponse.json(
      {
        error: "MISSING_IDEMPOTENCY_KEY",
        message:
          "Header `x-idempotency-key` is required for all task envelope requests (AGENTS.md §3.4).",
      },
      { status: 400 },
    )
  }

  // 命中缓存：直接返回原 taskId（HTTP 200，标记 idempotent）
  const hit = await checkIdempotencyKey(ctx.workspaceId, idempotencyKey)
  if (hit) {
    return NextResponse.json(
      { success: true, idempotent: true, data: { taskId: hit.taskId } },
      { status: 200 },
    )
  }

  // ── 2. 请求体校验 ───────────────────────────────────────────────
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "请求体必须是合法 JSON" },
      { status: 400 },
    )
  }

  const parsed = EnvelopeRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.issues },
      { status: 422 },
    )
  }
  const data = parsed.data

  // ── 2.5 解析 AutomationPolicy + clamp + L3/L4 审批门禁 ─────────────
  // AGENTS.md §4.7 / §5.2：服务端三级回退解析策略 → clamp 客户端越权抬升
  // → 升级到 L3/L4 或策略要求审批时，必须命中已审批 HarnessProposal，
  //   或由 ADMIN 显式 confirmed:true 二次确认。
  const policy = await resolveAutomationPolicy(
    ctx.workspaceId,
    data.agentId,
    data.actionType,
  )
  const clampedLevel = clampAutomationLevel(data.automationLevel, policy.automationLevel)

  const needsApproval =
    policy.requireApproval || LEVEL_RANK[clampedLevel] >= LEVEL_RANK.L3
  if (needsApproval) {
    const approved = await findApprovedProposalForAction(
      ctx.workspaceId,
      data.actionType,
    )
    const bodyConfirmed =
      typeof raw === "object" &&
      raw !== null &&
      (raw as { confirmed?: unknown }).confirmed === true
    const adminConfirmed = bodyConfirmed && ctx.role === "ADMIN"
    if (!approved && !adminConfirmed) {
      return NextResponse.json(
        {
          error: "APPROVAL_REQUIRED",
          message:
            "该 actionType 需 Harness 已审批提案，或由 ADMIN 显式 confirmed:true 二次确认",
          requiredApprovers: policy.approverIds,
          policySource: policy.source,
          clampedLevel,
        },
        { status: 403 },
      )
    }
  }

  // ── 3. 注入 policySnapshotVersion + 构造 envelope ─────────────────
  const policySnapshotVersion = await getCurrentPolicySnapshotVersion(
    ctx.workspaceId,
    data.agentId,
  )
  const taskId = `t-${crypto.randomUUID()}`

  let envelope
  try {
    envelope = TaskEnvelopeSchema.parse({
      taskId,
      workflowRunId: data.workflowRunId,
      workspaceId: ctx.workspaceId,
      industryId: data.industryId,
      agentId: data.agentId,
      actionType: data.actionType,
      input: data.input,
      automationLevel: clampedLevel,
      riskLevel: data.riskLevel,
      idempotencyKey,
      callbackTarget: data.callbackTarget,
      policySnapshotVersion,
      version: TASK_ENVELOPE_VERSION,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "SCHEMA_VIOLATION", issues: error.issues },
        { status: 422 },
      )
    }
    throw error
  }

  // ── 4. 写 AuditLog (task.dispatch) + 持久化幂等键 ────────────────
  const actor = await actorFromSession()
  const audit = await createAuditEntry({
    actor,
    action: "task.dispatch",
    targetType: "task",
    targetId: envelope.taskId,
    detail: `dispatch envelope.actionType=${envelope.actionType}`,
    riskLevel:
      envelope.riskLevel === "critical"
        ? "high"
        : envelope.riskLevel === "high"
        ? "high"
        : envelope.riskLevel === "medium"
        ? "medium"
        : "low",
    workspaceId: ctx.workspaceId,
    automationLevel: envelope.automationLevel,
    triggeredBy: "user",
    contextSnapshot: {
      taskId: envelope.taskId,
      workflowRunId: envelope.workflowRunId,
      agentId: envelope.agentId,
      industryId: envelope.industryId,
      actionType: envelope.actionType,
      idempotencyKey,
      policySnapshotVersion,
      step: "envelope-dispatch",
      requestedLevel: data.automationLevel,
      clampedLevel,
      policySource: policy.source,
      policyId: policy.policyId,
    },
  })

  try {
    await storeIdempotencyKey({
      workspaceId: ctx.workspaceId,
      key: idempotencyKey,
      taskId: envelope.taskId,
      scope: SCOPE,
    })
  } catch (error) {
    // storeIdempotencyKey 内部已吞 P2002；走到这里说明非并发冲突的写失败
    logger.error("[POST /api/tasks/envelope] 幂等键写入失败", {
      taskId: envelope.taskId,
      idempotencyKey,
      error: error instanceof Error ? error.message : "未知错误",
    })
    await updateAuditEntry({
      auditId: audit.auditId,
      status: "failed",
      detail: "幂等键写入失败：" + (error instanceof Error ? error.message : "未知错误"),
    })
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "幂等键写入失败" },
      { status: 500 },
    )
  }

  await updateAuditEntry({
    auditId: audit.auditId,
    status: "success",
    contextSnapshot: {
      taskId: envelope.taskId,
      workflowRunId: envelope.workflowRunId,
      idempotencyKey,
      policySnapshotVersion,
      dispatched: true,
    },
  })

  // 注：本任务只覆盖契约合规层；真正交给 OpenClaw 执行的派发逻辑
  // （openclawClient.executeTask 等）保留给后续任务接入，避免本次改动越界。
  return NextResponse.json(
    { success: true, idempotent: false, data: { taskId: envelope.taskId } },
    { status: 201 },
  )
}, "MEMBER")

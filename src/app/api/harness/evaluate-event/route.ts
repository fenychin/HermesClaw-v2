/**
 * POST /api/harness/evaluate-event —— ExecutionEvent 终态评估端点
 *
 * 与 /api/harness/evaluate 严格分离：
 *   - /api/harness/evaluate        前端触发的「Harness 升级提案」（agentId + triggerReason）
 *   - /api/harness/evaluate-event  OpenClaw runtime 在 ExecutionEvent 终态时回流的 M2M 端点
 *
 * 设计要点（CLAUDE.md §2.2 Contract-First / §5.1 OpenClaw 不绕过 Hermes）：
 *   - 输入 schema 与 ExecutionEvent 终态字段一一对应（taskId / workflowRunId / runtimeId /
 *     finalStatus / eventId）
 *   - **不走 withRBAC**：机器对机器，无 session cookie；改用内部 token：
 *     * 优先头部 `x-internal-token` 与环境变量 INTERNAL_TASK_CALLBACK_TOKEN 比对
 *     * 未配置 token 时仅放行 dev/test 环境（生产必配）
 *   - 写 EvolutionLog（仓库实际承担 EvaluationReport 落库语义）+ AuditLog
 *   - 同一 eventId 重复回流 → 200 + duplicate:true（与 /api/openclaw/events 的去重对齐）
 *   - 该端点本身不阻塞 OpenClaw 主链路；OpenClaw POST 侧已有失败兜底（仅 console.error）
 *
 * 该端点是 §3.4 OpenClaw → Harness 回调的承接点，也是冒烟脚本「阶段 3」的验证目标。
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { writeAuditLog } from "@/lib/server/shared/audit"
import { rateLimit } from "@/lib/rate-limit"
import { writeEvolutionLog } from "@/lib/server/harness/report-builder"
import { lookupWorkspaceByTaskId } from "@/lib/server/shared/task-lookup"
import { checkInternalToken } from "@/lib/server/shared/internal-auth"
import {
  ExecutionStatusSchema,
  IdSchema,
  PayloadSchema,
} from "@hermesclaw/event-contracts"

export const runtime = "nodejs"

/** 入口请求体：与 ExecutionEvent 终态字段对齐，PayloadSchema 透传 payload */
const EvaluateEventSchema = z.object({
  taskId: IdSchema,
  workflowRunId: IdSchema,
  runtimeId: IdSchema,
  /** 通常为 completed | failed；其余值视为非终态被拒 */
  finalStatus: ExecutionStatusSchema,
  eventId: z.string().uuid(),
  payload: PayloadSchema.optional(),
})

export async function POST(req: NextRequest): Promise<Response> {
  // 频率限制：M2M 高频回调，每个 IP 每分钟 240 次
  const ip = req.headers.get("x-forwarded-for") || "unknown"
  if (!rateLimit(`evaluate-event:${ip}`, 240, 60_000)) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "回调过于频繁" },
      { status: 429 },
    )
  }

  // 1. 内部认证（D2：共用 internal-auth helper）
  const authResult = checkInternalToken(req.headers)
  if (!authResult.ok) {
    logger.warn("[harness/evaluate-event] 内部认证失败", { reason: authResult.reason })
    return NextResponse.json(
      { error: authResult.reason },
      { status: authResult.status },
    )
  }

  // 2. JSON 解析
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "请求体必须是合法 JSON" },
      { status: 400 },
    )
  }

  // 3. schema 校验
  const parsed = EvaluateEventSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_EVALUATE_REQUEST", issues: parsed.error.issues },
      { status: 422 },
    )
  }
  const body = parsed.data

  // 4. 仅终态 completed | failed 才走评估写入；其他状态拒绝 422（V4 修复）
  //    语义上此端点仅接受终态；started/progress 抵达是上游 bug，不应静默 200 吞错。
  if (body.finalStatus !== "completed" && body.finalStatus !== "failed") {
    return NextResponse.json(
      {
        error: "NON_TERMINAL_STATUS",
        message: `不支持非终态状态: ${body.finalStatus}`,
      },
      { status: 422 },
    )
  }

  // 5. 反查 task → workspaceId（V1 修复：禁用 "default" 兜底防止跨租户污染指标）
  //    EvolutionLog 直接进入 §5.3 评估输入，错误归属会污染他人提案推荐。
  //    反查不到时拒绝写入并返回 422，让上游修复 dispatch 链路。
  const workspaceId = await lookupWorkspaceByTaskId(body.taskId)
  if (!workspaceId) {
    logger.warn("[harness/evaluate-event] 反查 workspaceId 失败，拒绝写入 EvolutionLog", {
      taskId: body.taskId,
      eventId: body.eventId,
    })
    return NextResponse.json(
      {
        error: "TASK_WORKSPACE_NOT_FOUND",
        message: "无法通过 taskId 反查 workspaceId，可能 dispatch 链路异常或 task 已过期",
        taskId: body.taskId,
      },
      { status: 422 },
    )
  }

  // 6. 校验 ExecutionEventLog 是否真有这条 eventId（事件溯源完整性检查）
  try {
    const eventLog = await prisma.executionEventLog.findUnique({
      where: { eventId: body.eventId },
      select: { id: true },
    })
    if (!eventLog) {
      logger.warn("[harness/evaluate-event] 未在 ExecutionEventLog 中找到对应 eventId", {
        eventId: body.eventId,
        taskId: body.taskId,
      })
    }
  } catch (error) {
    logger.error("[harness/evaluate-event] 反查 ExecutionEventLog 失败", {
      eventId: body.eventId,
      error: error instanceof Error ? error.message : "未知错误",
    })
  }

  // 7. 幂等：同一 eventId 已写入 EvolutionLog → 不重复写
  try {
    const existing = await prisma.evolutionLog.findFirst({
      where: { reportId: `EVT-${body.eventId}` },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { received: true, duplicate: true, evolutionLogId: existing.id },
        { status: 200 },
      )
    }
  } catch (error) {
    // E4 修复：幂等查询失败不再"按非重复继续"，而是 500 要求上游重试。
    //   EvolutionLog.reportId 当前未建 unique 约束，查询失败=无法判重=并发写风险。
    logger.error("[harness/evaluate-event] 幂等查询失败，拒绝继续写入", {
      eventId: body.eventId,
      error: error instanceof Error ? error.message : "未知错误",
    })
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "幂等查询失败，请重试" },
      { status: 500 },
    )
  }

  // 8. 通过 writeEvolutionLog 写入（D1 修复：复用报告构建器，含 fail 兜底审计）
  //    极简指标映射：单次终态回调 → 单点指标快照，供 §5.3 评估输入读取
  const isSuccess = body.finalStatus === "completed"
  const reportId = `EVT-${body.eventId}`
  try {
    await writeEvolutionLog(prisma, {
      workspaceId,
      triggeredBy: "auto",
      triggered: false,
      metrics: {
        total: 1,
        errors: isSuccess ? 0 : 1,
        success: isSuccess ? 1 : 0,
        errorRate: isSuccess ? 0 : 1,
        successRate: isSuccess ? 1 : 0,
        windowHours: 0,
      },
      provider: null,
      model: null,
      reportId,
      reason: `event-callback runtimeId=${body.runtimeId} task=${body.taskId} status=${body.finalStatus}`,
    })
  } catch (error) {
    logger.error("[harness/evaluate-event] EvolutionLog 写入失败（含 fail 兜底审计）", {
      eventId: body.eventId,
      error: error instanceof Error ? error.message : "未知错误",
    })
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "EvolutionLog 写入失败" },
      { status: 500 },
    )
  }

  // 9. 审计留痕
  //    注：writeEvolutionLog 自身已写 audit（evolution.log.fail on error），
  //    此处额外写一条 task.evaluate 对应本次终态回调进入此端点的语义
  await writeAuditLog({
    actor: body.runtimeId,
    action: "task.evaluate",
    targetType: "task",
    targetId: body.taskId,
    detail:
      `eventId=${body.eventId} workflowRunId=${body.workflowRunId} ` +
      `finalStatus=${body.finalStatus} reportId=${reportId}`,
    riskLevel: body.finalStatus === "failed" ? "medium" : "low",
    workspaceId,
  })

  return NextResponse.json(
    {
      received: true,
      evaluated: true,
      duplicate: false,
      reportId,
    },
    { status: 200 },
  )
}

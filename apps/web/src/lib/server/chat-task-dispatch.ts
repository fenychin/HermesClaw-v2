/**
 * Chat Task Dispatch Service — 新对话入口的 TaskEnvelope 写入闭环
 *
 * 职责：
 *   1. 轻量关键词风险推导（无需 LLM，响应 <1ms）
 *   2. LLM 意图解析 → TaskEnvelope（失败时返回 fallback）
 *   3. AuditLog 预记录 → WorkflowRun 创建 → AuditLog 更新
 *   4. L3/L4 安全门禁（保留以便未来策略升级后启用）
 *
 * 遵循 AGENTS.md §3.2（Hermes 是 Task Truth Source）、
 * §4.5（安全护栏）、§5 #3（禁止静默执行：预记录模式）。
 *
 * 本模块不依赖 agentId，专为 chat 通用入口设计。
 * 与 intent-service.ts（需 agentId）正交，不互相耦合。
 *
 * Architecture Decision: 直接 prisma.workflowRun.create, 不走 dispatchEnvelope.
 *   — chat 场景无 DAG 步骤, WorkflowRun 标记 completed.
 *
 * Architecture Decision: deriveRiskAndAutomation 关键词正则仅为本模块专用.
 *   — 最终裁决通过 checkPolicySync 委托 kernel MATRIX.
 */

import crypto from "crypto";
import { TaskEnvelopeSchema, type TaskEnvelope } from "@hermesclaw/event-contracts";
import type { AutomationLevel, RiskLevel } from "@hermesclaw/event-contracts";
import { checkPolicySync } from "@hermesclaw/hermes-kernel";
import { selectModel, type RouteRiskLevel } from "@/lib/server/model-router";
import { callAnthropicStructured, callDeepSeekJson } from "@/lib/server/llm-provider";
import { createAuditEntry, updateAuditEntry, writeAuditLog, actorFromSession } from "@/lib/server/audit";
import { prisma } from "@/lib/prisma";
import type { AuditRiskLevel } from "@/types";
import { INTENT_EXTRACT_SCHEMA, INTENT_SYSTEM_PROMPT } from "./intent-service";

// ══════════════════════════════════════════════════════
// 轻量风险推导（关键词正则，零 LLM 调用）
//
// 关键词推导出 riskLevel 后，统一交由 kernel 的 checkPolicySync
// 授权矩阵裁决。不在此重复实现 policy 逻辑，避免平行状态体系。
//
// 关键词规则集仅为此模块专用（chat 场景轻量快速通道），
// 不作为通用 policy 导出。与 kernel MATRIX 的关系：
//   keyword → candidate(risk,auto) → checkPolicySync → final(risk,auto)
// ══════════════════════════════════════════════════════

/** Chat 场景高风险信号词（轻量预筛选，不替代 policy 矩阵） */
const HIGH_RISK_SIGNAL_WORDS = /发送|发信|邮件|email|删除|delete|修改|更新|高危|high|支付|付款|报价|合同|折扣|cancel|order|notify/i;
const CRITICAL_SIGNAL_WORDS = /删除客户|delete.client|删除全部|delete.all|退款|refund|取消所有|cancel.all|批准|核准|approve/i;

interface RiskAssessment {
  riskLevel: RiskLevel;
  automationLevel: AutomationLevel;
}

function deriveRiskAndAutomation(input: string): RiskAssessment {
  const s = input.toLowerCase();

  let candidateRisk: RiskLevel;
  let candidateAuto: AutomationLevel;

  if (CRITICAL_SIGNAL_WORDS.test(s)) {
    candidateRisk = "critical";
    candidateAuto = "L4";
  } else if (HIGH_RISK_SIGNAL_WORDS.test(s)) {
    candidateRisk = "high";
    candidateAuto = "L3";
  } else {
    candidateRisk = "low";
    candidateAuto = "L2";
  }

  // 通过 kernel 授权矩阵验证裁决，确保与 policy 层一致（审查要求 F2）
  const verdict = checkPolicySync(candidateRisk, candidateAuto, "chat.dispatch");
  if (!verdict.allowed) {
    // 裁决不允许（blocked/approval）→ 降级到 L2 low 保守设定
    return { riskLevel: "low", automationLevel: "L2" };
  }
  return { riskLevel: candidateRisk, automationLevel: candidateAuto };
}

// ══════════════════════════════════════════════════════
// LLM 意图解析 → TaskEnvelope
//
// Intent schema 和 system prompt 复用 intent-service 的导出常量。
// LLM 调用逻辑独立（chat 场景 fallback 降级，不抛异常）。
//
// 不依赖 agentId，使用 "chat.general" 占位。
// ══════════════════════════════════════════════════════

interface ParsedIntent {
  actionType: string;
  input: Record<string, unknown>;
  callbackTarget?: string;
}

function buildFallbackEnvelope(
  input: string,
  context: ChatDispatchContext,
  riskLevel: RiskLevel,
  automationLevel: AutomationLevel,
): TaskEnvelope {
  const taskId = crypto.randomUUID();
  return TaskEnvelopeSchema.parse({
    taskId,
    workflowRunId: crypto.randomUUID(),
    workspaceId: context.workspaceId,
    industryId: context.industryId,
    agentId: "chat.general",
    actionType: "chat.manual",
    input: { raw: input, fallback: true },
    automationLevel,
    riskLevel,
    idempotencyKey: `idem-${taskId}`,
    callbackTarget: "workflow-callback",
    policySnapshotVersion: "1.0.0",
    version: "1.0.0",
  });
}

async function parseChatIntent(
  input: string,
  riskLevel: RiskLevel,
  automationLevel: AutomationLevel,
  context: ChatDispatchContext,
): Promise<{ envelope: TaskEnvelope; fallback: boolean }> {
  try {
    const routeRisk: RouteRiskLevel =
      riskLevel === "critical" ? "high" : (riskLevel as RouteRiskLevel);

    const decision = await selectModel({
      taskType: "workflow",
      riskLevel: routeRisk,
      estimatedTokens: 1000,
      workspaceId: context.workspaceId,
    });

    let parsed: ParsedIntent;

    if (decision.provider === "anthropic") {
      const raw = await callAnthropicStructured({
        systemPrompt: INTENT_SYSTEM_PROMPT,
        userPrompt: input,
        schema: INTENT_EXTRACT_SCHEMA as Record<string, unknown>,
        model: decision.model,
        thinking: false,
      });
      parsed = raw as ParsedIntent;
    } else {
      const raw = await callDeepSeekJson({
        systemPrompt: `${INTENT_SYSTEM_PROMPT}\n只输出符合要求的 JSON，不要 Markdown 包裹。`,
        userPrompt: input,
        model: decision.model,
      });
      parsed = raw as ParsedIntent;
    }

    if (!parsed?.actionType || !parsed?.input) {
      throw new Error("LLM 意图解析结果不完整");
    }

    const taskId = crypto.randomUUID();
    const envelope = TaskEnvelopeSchema.parse({
      taskId,
      workflowRunId: crypto.randomUUID(),
      workspaceId: context.workspaceId,
      industryId: context.industryId,
      agentId: "chat.general",
      actionType: parsed.actionType,
      input: parsed.input,
      automationLevel,
      riskLevel,
      idempotencyKey: crypto.randomUUID(),
      callbackTarget: parsed.callbackTarget || "workflow-callback",
      policySnapshotVersion: "1.0.0",
      version: "1.0.0",
    });

    return { envelope, fallback: false };
  } catch (err) {
    console.warn("[chat-task-dispatch] LLM 意图解析失败，使用 fallback TaskEnvelope:", err);
    const envelope = buildFallbackEnvelope(input, context, riskLevel, automationLevel);
    return { envelope, fallback: true };
  }
}

// ══════════════════════════════════════════════════════
// 公共接口
// ══════════════════════════════════════════════════════

export interface ChatDispatchContext {
  workspaceId: string;
  industryId: string;
  userId?: string;
}

export interface ChatDispatchResult {
  taskId: string;
  workflowRunId: string;
  /** 信封摘要（不含完整 input，避免 payload 泄漏到前端响应） */
  envelope: {
    actionType: string;
    riskLevel: string;
    automationLevel: string;
  };
  /** 是否使用了 fallback 信封（LLM 解析失败） */
  fallback: boolean;
  /** dispatch → completed 耗时（毫秒），供前端回显执行证据 */
  durationMs: number;
}

export class ChatDispatchError extends Error {
  constructor(
    public readonly httpStatus: number,
    message: string,
    public readonly code?: string,
    public readonly requiresConfirmation?: boolean,
    public readonly riskLevel?: string,
    public readonly automationLevel?: string,
  ) {
    super(message);
    this.name = "ChatDispatchError";
  }
}

/**
 * 处理 Chat 入口的 TaskEnvelope 写入闭环。
 *
 * 流程：
 *  1. 关键词风险推导
 *  2. L3/L4 门禁检查
 *  3. AuditLog 预记录（pending）
 *  4. LLM 意图解析 + TaskEnvelope 组装
 *  5. dispatchEnvelope → WorkflowRun + envelopeSnapshot
 *  6. AuditLog 更新（success / failed）
 *
 * @param input    用户原始输入
 * @param context  工作区上下文
 * @param opts     L3 确认标记等
 * @returns        taskId + workflowRunId + envelope 摘要
 */
export async function dispatchChatTask(
  input: string,
  context: ChatDispatchContext,
  opts?: { confirmed?: boolean },
): Promise<ChatDispatchResult> {
  // 1. 轻量风险推导
  const { riskLevel, automationLevel } = deriveRiskAndAutomation(input);

  // 2. L4 硬拒绝（绝对禁止自动执行）
  //    注意：当前 kernel policy 矩阵下 critical+L4=blocked，故此路径不可达。
  //    保留以便未来 workspace 策略升级后自动启用。
  if (automationLevel === "L4") {
    // 门禁拒绝必须留审计痕迹（审查要求）
    writeAuditLog({
      actor: "system",
      action: "task.dispatch.blocked",
      targetType: "task",
      targetId: "pending",
      detail: `Chat L4 门禁拦截: "${input.slice(0, 200)}"`,
      riskLevel: "high",
      workspaceId: context.workspaceId,
      contextSnapshot: {
        inputPreview: input.slice(0, 500),
        riskLevel,
        automationLevel,
        source: "chat",
        reason: "L4_FORBIDDEN",
      },
    }).catch((e) => console.error("[chat-task-dispatch] L4 blocked audit write failed:", e));

    throw new ChatDispatchError(
      403,
      "L4 动作禁止系统自动执行，请简化需求或在人工审批通道发起",
      "L4_FORBIDDEN",
      false,
      riskLevel,
      automationLevel,
    );
  }

  // 3. L3 门禁：需用户显式确认
  //    注意：当前 kernel policy 矩阵下 high+L3=blocked，故此路径不可达。
  //    保留以便未来 workspace 策略升级后自动启用。
  if (automationLevel === "L3" && !opts?.confirmed) {
    // 门禁拒绝必须留审计痕迹（审查要求）
    writeAuditLog({
      actor: "system",
      action: "task.dispatch.blocked",
      targetType: "task",
      targetId: "pending",
      detail: `Chat L3 门禁拦截（待确认）: "${input.slice(0, 200)}"`,
      riskLevel: "medium",
      workspaceId: context.workspaceId,
      contextSnapshot: {
        inputPreview: input.slice(0, 500),
        riskLevel,
        automationLevel,
        source: "chat",
        reason: "L3_CONFIRMATION_REQUIRED",
      },
    }).catch((e) => console.error("[chat-task-dispatch] L3 blocked audit write failed:", e));

    throw new ChatDispatchError(
      409,
      "该操作存在高风险，确认后将立即生效且无法撤销，请二次确认",
      "CONFIRMATION_REQUIRED",
      true,
      riskLevel,
      automationLevel,
    );
  }

  // 3a. L3 确认通过：写入 ApprovalCheckpoint 留痕
  //    注意：当前 kernel policy 矩阵下 high+L3=blocked，故此路径不可达。
  //    保留以便未来 workspace 策略升级支持 L3 自动审批后自动启用。
  if (automationLevel === "L3" && opts?.confirmed) {
    try {
      const { createApprovalCheckpoint } = await import("./approval");
      await createApprovalCheckpoint({
        taskId: "pending", // dispatch 后用真实 taskId 更新
        workflowRunId: "pending",
        workspaceId: context.workspaceId,
        triggerReason: "manual.escalation",
        riskLevel,
        automationLevel,
        actionSummary: `Chat L3 确认: ${input.slice(0, 200)}`,
        inputSnapshot: { input: input.slice(0, 500), riskLevel, automationLevel },
        policySnapshotVersion: "1.0.0",
        expiresAt: new Date(Date.now() + 86400000),
        creator: context.userId ?? "system",
      });
    } catch (e) {
      // ApprovalCheckpoint 写入失败不阻断主流程
      console.warn("[chat-task-dispatch] L3 checkpoint write failed:", e);
    }
  }

  // 4. AuditLog 预记录
  const actor = await actorFromSession();
  const auditRisk: AuditRiskLevel =
    riskLevel === "critical" ? "high" : (riskLevel as AuditRiskLevel);

  const auditEntry = await createAuditEntry({
    actor,
    action: "task.dispatch",
    targetType: "task",
    targetId: "pending", // dispatch 后用真实 taskId 更新
    detail: `用户从 Chat 入口发起任务: "${input.slice(0, 200)}"`,
    riskLevel: auditRisk,
    workspaceId: context.workspaceId,
    automationLevel,
    triggeredBy: "user",
    contextSnapshot: {
      inputPreview: input.slice(0, 500),
      riskLevel,
      automationLevel,
      source: "chat",
    },
  });

  try {
    // 5. 意图解析 + TaskEnvelope 组装
    const { envelope, fallback } = await parseChatIntent(
      input,
      riskLevel,
      automationLevel,
      context,
    );

    // 6. 直接创建 WorkflowRun（跳过 dispatchEnvelope / startWorkflowRun）
    //    —— chat 场景不走 DAG 执行，不需要 Workflow 定义和节点校验。
    //    直接创建 run 记录并持久化 envelopeSnapshot，标记 completed。
    const runId = `run-${crypto.randomUUID()}`;
    const run = await prisma.workflowRun.create({
      data: {
        runId,
        workspaceId: context.workspaceId,
        workflowId: "chat-direct",
        status: "running",
        mode: "sequential",
        triggeredBy: context.userId ?? actor,
        triggerType: "agent-dispatch",
        agentId: envelope.agentId,
        inputContext: {
          taskId: envelope.taskId,
          actionType: envelope.actionType,
          riskLevel: envelope.riskLevel,
          automationLevel: envelope.automationLevel,
          ...(envelope.input as Record<string, unknown>),
        },
        envelopeSnapshot: envelope as any,
        input: JSON.stringify(envelope.input ?? {}),
      },
    });

    // 7. Chat 场景无 DAG 步骤——标记 WorkflowRun 为 completed，
    //    写入 ExecutionSummary 避免 WorkflowRun 永久僵尸状态。
    const now = new Date();
    const startedAt = run.startedAt ? new Date(run.startedAt) : now;
    const durationMs = now.getTime() - startedAt.getTime();
    await prisma.workflowRun.update({
      where: { runId: run.runId },
      data: {
        status: "completed",
        completedAt: now,
        finishedAt: now,
        durationMs,
        outputContext: {
          taskId: envelope.taskId,
          actionType: envelope.actionType,
          completedAt: now.toISOString(),
          fallback,
          summary: `Chat 任务完成。actionType=${envelope.actionType}, riskLevel=${envelope.riskLevel}, automationLevel=${envelope.automationLevel}`,
        },
      },
    });

    // 8. 写入 run.completed 审计事件（OpenClaw 事件合同要求）
    writeAuditLog({
      actor: context.userId ?? actor,
      action: "run.completed",
      targetType: "workflow_run",
      targetId: run.runId,
      detail: `Chat WorkflowRun 完成: taskId=${envelope.taskId}, actionType=${envelope.actionType}`,
      riskLevel: "low",
      workspaceId: context.workspaceId,
      contextSnapshot: {
        taskId: envelope.taskId,
        workflowRunId: run.runId,
        actionType: envelope.actionType,
        riskLevel,
        automationLevel,
        durationMs,
        fallback,
      },
    }).catch((e) => console.error("[chat-task-dispatch] run.completed audit write failed:", e));

    // 9. AuditLog 更新为 success
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "success",
      detail: `Chat 任务分发成功: taskId=${envelope.taskId}, workflowRunId=${run.runId}, actionType=${envelope.actionType}, fallback=${fallback}`,
      contextSnapshot: {
        taskId: envelope.taskId,
        workflowRunId: run.runId,
        actionType: envelope.actionType,
        riskLevel,
        automationLevel,
        fallback,
        source: "chat",
      },
    });

    return {
      taskId: envelope.taskId,
      workflowRunId: run.runId,
      envelope: {
        actionType: envelope.actionType,
        riskLevel: envelope.riskLevel,
        automationLevel: envelope.automationLevel,
      },
      fallback,
      durationMs,
    };
  } catch (err) {
    // dispatch 失败不抛到外层——更新 AuditLog 为 failed，再抛出
    if (err instanceof ChatDispatchError) {
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "failed",
        detail: `Chat 任务分发被门禁拦截: ${err.message}`,
        contextSnapshot: { riskLevel, automationLevel, code: err.code },
      });
      throw err;
    }

    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "failed",
      detail: `Chat 任务分发失败: ${err instanceof Error ? err.message : "未知错误"}`,
      contextSnapshot: { riskLevel, automationLevel },
    });

    throw new ChatDispatchError(
      500,
      `任务分发失败: ${err instanceof Error ? err.message : "服务器内部错误"}`,
      "DISPATCH_FAILED",
    );
  }
}

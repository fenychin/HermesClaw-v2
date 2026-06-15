import crypto from "crypto"
import { EventEmitter } from "events"
import { ExecutionEventSchema, type ExecutionEvent } from "@/contracts/execution-event"
import { TaskEnvelopeSchema, type TaskEnvelope } from "@/contracts/task-envelope"
import { executeHttpConnector } from "@/lib/server/connectors/http-connector"
import { validateTaskAutomationLevel } from "@/lib/server/guardrail"

const eventBus = new EventEmitter();

// 避免并发监听数警告上限
eventBus.setMaxListeners(1000);

/**
 * 订阅特定任务 ID 的所有执行事件。
 * 
 * 遵守 AGENTS.md §2.2 和 §3.1 运行时契约：
 * - 提供 subscribeExecutionEvents 方法
 * - 接收 taskId 并通过 onEvent 回调通知
 * - 返回一个解除监听的 unsubscribe 闭包函数
 */
export function subscribeExecutionEvents(
  taskId: string,
  onEvent: (e: ExecutionEvent) => void
): () => void {
  const handler = (event: ExecutionEvent) => {
    if (event.taskId === taskId) {
      onEvent(event);
    }
  };
  eventBus.on("execution_event", handler);
  return () => {
    eventBus.off("execution_event", handler);
  };
}

/**
 * 广播一个标准契约执行事件。
 */
export function emitBusEvent(event: ExecutionEvent): void {
  // 强校验事件契约格式，确保字段完整合规
  const validated = ExecutionEventSchema.parse(event);
  eventBus.emit("execution_event", validated);
}

/**
 * 分发并执行任务封包。
 * 
 * 遵守 AGENTS.md §2.2、§3.1 和 CLAUDE.md §5.1、§5.2 要求：
 * - 异步广播执行事件轨迹：started -> completed/failed -> summary
 * - 组装临时 ConnectorLease 授权去调用真实的 HTTP 连接器
 */
export async function dispatchTaskEnvelope(envelope: TaskEnvelope): Promise<void> {
  // 强校验 TaskEnvelope 契约合法性
  TaskEnvelopeSchema.parse(envelope);

  // 校验自动化授权等级安全护栏 (AGENTS.md §5.2)
  await validateTaskAutomationLevel(envelope);

  // 写入正常派发审计日志
  try {
    const { writeAuditLog } = await import("@/lib/server/audit");
    await writeAuditLog({
      actor: envelope.agentId || "system",
      action: "task.dispatch",
      targetType: "task",
      targetId: envelope.taskId,
      detail: `任务被派发至执行总线，ActionType: ${envelope.actionType}`,
      riskLevel: envelope.riskLevel === "critical" ? "high" : envelope.riskLevel,
      workspaceId: envelope.workspaceId || "default"
    });
  } catch (error) {
    console.error("Failed to write task.dispatch audit log:", error);
  }

  const startTime = new Date();
  const taskId = envelope.taskId;
  const workflowRunId = envelope.workflowRunId;

  // 事件广播辅助函数
  const broadcastEvent = (eventType: any, status: any, payload: Record<string, unknown>) => {
    const rawEvent: ExecutionEvent = {
      eventId: `evt-${crypto.randomUUID()}`,
      taskId,
      workflowRunId,
      runtimeId: "openclaw-runtime",
      eventType,
      status,
      timestamp: new Date().toISOString(),
      payload,
      version: "1.0.0",
    };
    emitBusEvent(rawEvent);
  };

  // 1. 发射 started 阶段事件
  broadcastEvent("run.started", "started", {
    message: `Task ${taskId} execution started`,
    actionType: envelope.actionType,
  });

  try {
    // 2. 组装临时 ConnectorLease 授权对象 (ConnectorLease)
    const lease = {
      leaseId: `lease-${crypto.randomUUID()}`,
      taskId,
      workspaceId: envelope.workspaceId,
      connectorId: "http-connector",
      runtimeId: "openclaw-runtime",
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      scope: ["write"],
      maxRiskLevel: envelope.riskLevel,
      status: "active" as const,
      version: "1.0.0",
    };

    // 3. 执行真实 HTTP 交互获取 ActionReceipt
    const receipt = await executeHttpConnector(
      lease,
      envelope.input,
      workflowRunId,
      envelope.idempotencyKey
    );

    if (receipt.outcome === "failure") {
      throw new Error(receipt.errorCode || "HTTP Connector execution failed");
    }

    // 4. 发射 completed 阶段事件
    broadcastEvent("run.completed", "completed", {
      message: `Task ${taskId} completed successfully`,
      outcome: receipt.outcome,
      receiptId: receipt.receiptId,
      idempotencyKey: receipt.idempotencyKey,
    });

    // 5. 发射 summary 阶段事件
    broadcastEvent("run.progress", "completed", {
      summary: receipt.response?.summary || `HTTP Connector executed. Response ID: ${receipt.receiptId}`,
      processedItems: 1,
      quality: "high",
    });

    // 6. 构造最终的 ExecutionSummary 并执行契约强校验 (AGENTS §3.1 / §3.2)
    const { ExecutionSummarySchema } = await import("@/contracts/execution-summary");
    ExecutionSummarySchema.parse({
      summaryId: `sum-${crypto.randomUUID()}`,
      taskId,
      workflowRunId,
      finalStatus: "completed",
      startedAt: startTime.toISOString(),
      completedAt: new Date().toISOString(),
      eventCount: 3, // started, completed, progress
      receiptHashes: [crypto.createHash("sha256").update(JSON.stringify(receipt)).digest("hex")],
      version: "1.0.0"
    });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // 失败分支发射 failed 事件
    broadcastEvent("run.failed", "failed", {
      error: errMsg,
      message: `Task ${taskId} execution failed`,
    });

    // 失败时也产生并校验最终的 ExecutionSummary 契约 (AGENTS §3.1 / §3.2)
    try {
      const { ExecutionSummarySchema } = await import("@/contracts/execution-summary");
      ExecutionSummarySchema.parse({
        summaryId: `sum-${crypto.randomUUID()}`,
        taskId,
        workflowRunId,
        finalStatus: "failed",
        startedAt: startTime.toISOString(),
        completedAt: new Date().toISOString(),
        eventCount: 2, // started, failed
        error: errMsg,
        version: "1.0.0"
      });
    } catch (summaryErr) {
      console.error("Failed to generate execution summary:", summaryErr);
    }
  }
}

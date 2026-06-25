import crypto from "crypto"
import { ActionReceiptSchema, type ActionReceipt } from "@hermesclaw/event-contracts"
import { ConnectorLeaseSchema, type ConnectorLease } from "@hermesclaw/event-contracts"
import { writeAuditLog, createAuditEntry, updateAuditEntry } from "@/lib/server/audit"
import { actorFromSession } from "@/lib/server/audit"
import type { AuditRiskLevel } from "@/types"
import { storeReceipt } from "../receipt-store"

/**
 * 执行真实的 HTTP POST 交互，并返回 ActionReceipt。
 * 
 * 遵守 AGENTS.md §3.4 契约与 §6 治理要求：
 * - 验证租约合法性
 * - 对外写操作必须产生回执 (ActionReceipt)
 * - 声明明确的补偿策略 (compensationStrategy)
 * - 操作执行前记录 AuditLog (action: 'connector.execute')
 */
export async function executeHttpConnector(
  lease: ConnectorLease,
  input: Record<string, unknown>,
  workflowRunId: string,
  idempotencyKey: string
): Promise<ActionReceipt> {
  // 1. 强校验 ConnectorLease 契约
  ConnectorLeaseSchema.parse(lease);

  // 1.5 高危租约校验（AGENTS.md §3.5 高危租约校验约定）
  if (lease.leaseId.startsWith('acp-')) {
    const { prisma } = await import("@/lib/prisma");
    const checkpoint = await prisma.approvalCheckpoint.findUnique({
      where: { checkpointId: lease.leaseId }
    });
    if (!checkpoint || checkpoint.decision !== 'approved') {
      throw new Error(`[http-connector] ConnectorLease token is invalid or expired: ${lease.leaseId}`);
    }
    if (checkpoint.expiresAt.getTime() < Date.now()) {
      throw new Error(`[http-connector] ConnectorLease token is invalid or expired: ${lease.leaseId}`);
    }
    if (checkpoint.workspaceId !== lease.workspaceId) {
      throw new Error(`[http-connector] ConnectorLease does not match workspace: ${lease.leaseId}`);
    }
    // 写入对账审计日志
    await writeAuditLog({
      actor: lease.runtimeId || 'system',
      action: 'approval.verified',
      targetType: 'approval',
      targetId: lease.leaseId,
      detail: `Verified and consumed approval checkpoint token ${lease.leaseId} for HTTP Connector POST execution.`,
      riskLevel: 'low',
      workspaceId: lease.workspaceId,
      workflowRunId: workflowRunId
    });
  }

  // 2. 提取输入参数
  // TD-SPRINT-C-001: 移除 httpbin 兜底；IM/消息类通道请改用 executeOpenClawGateway()
  const url = input.url as string;
  if (!url) {
    throw new Error(
      "[http-connector] input.url is required. " +
      "For IM/messaging channels, use executeOpenClawGateway() instead of executeHttpConnector()."
    );
  }
  const body = (input.body as Record<string, unknown>) || {};

  // 3. 预执行审计（AGENTS.md §3.5 连接器预执行审计约定）
  const actor = await actorFromSession();
  const auditRiskLevel: AuditRiskLevel =
    lease.maxRiskLevel === "critical" ? "high" : (lease.maxRiskLevel as AuditRiskLevel);

  const connectorAudit = await createAuditEntry({
    actor,
    action: "connector.execute",
    targetType: "connector",
    targetId: lease.connectorId,
    detail: `HTTP Connector executing POST request to URL: ${url}`,
    riskLevel: auditRiskLevel,
    workspaceId: lease.workspaceId,
    workflowRunId,
  });

  // 4. 执行真实 HTTP POST 交互
  let outcome: "success" | "failure" = "success";
  let responseData: Record<string, unknown> = {};
  let errorCode: string | undefined = undefined;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      outcome = "failure";
      errorCode = `HTTP_ERR_${res.status}`;
      responseData = {
        status: res.status,
        statusText: res.statusText,
        message: "Target HTTP server returned a non-ok status code",
      };
    } else {
      const text = await res.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        responseData = { text };
      }
    }
  } catch (err) {
    outcome = "failure";
    errorCode = "NETWORK_ERROR";
    responseData = {
      error: err instanceof Error ? err.message : String(err),
      message: "Failed to connect to the target host",
    };
  }

  // 4.5 更新预执行审计状态（AGENTS.md §3.5 连接器预执行审计约定）
  await updateAuditEntry({
    auditId: connectorAudit.auditId,
    status: outcome === "success" ? "success" : "failed",
    detail: outcome === "success"
      ? `HTTP POST to ${url} completed successfully`
      : `HTTP POST to ${url} failed: ${errorCode}`
  });

  // 5. 组装 ActionReceipt
  const receipt: ActionReceipt = {
    receiptId: `rcpt-${crypto.randomUUID()}`,
    taskId: lease.taskId,
    workflowRunId,
    connectorId: lease.connectorId,
    idempotencyKey,
    outcome,
    executedAt: new Date().toISOString(),
    response: responseData,
    errorCode,
    // 不可逆写操作必须声明 compensationStrategy (AGENTS §3.4)
    compensationStrategy: "This action performed an HTTP POST. Compensation: Send a reversing DELETE request or perform manual verification via target transaction logs.",
    version: "1.0.0",
  };

  // 5.5 存入数据库 (P0 四层日志链贯通)
  try {
    await storeReceipt({
      receiptId: receipt.receiptId,
      taskId: receipt.taskId,
      workflowRunId: receipt.workflowRunId,
      connectorId: receipt.connectorId,
      idempotencyKey: receipt.idempotencyKey,
      outcome: receipt.outcome,
      executedAt: receipt.executedAt,
      response: receipt.response,
      errorCode: receipt.errorCode,
      compensationStrategy: receipt.compensationStrategy,
      version: receipt.version,
      workspaceId: lease.workspaceId
    })
  } catch (storeErr) {
    console.error("[http-connector] ActionReceipt 存库失败：", storeErr)
  }

  // 6. 强校验 ActionReceipt 并返回
  return ActionReceiptSchema.parse(receipt);
}

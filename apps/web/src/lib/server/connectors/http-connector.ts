import crypto from "crypto"
import { ActionReceiptSchema, type ActionReceipt } from "@hermesclaw/event-contracts"
import { ConnectorLeaseSchema, type ConnectorLease } from "@hermesclaw/event-contracts"
import { writeAuditLog } from "@/lib/server/audit"
import { actorFromSession } from "@/lib/server/audit"
import type { AuditRiskLevel } from "@/types"

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

  // 2. 提取输入参数
  const url = (input.url as string) || "https://httpbin.org/post";
  const body = (input.body as Record<string, unknown>) || {};

  // 3. 记录审计日志
  const actor = await actorFromSession();
  const auditRiskLevel: AuditRiskLevel =
    lease.maxRiskLevel === "critical" ? "high" : (lease.maxRiskLevel as AuditRiskLevel);

  await writeAuditLog({
    actor,
    action: "connector.execute",
    targetType: "connector",
    targetId: lease.connectorId,
    detail: `HTTP Connector executing POST request to URL: ${url}`,
    riskLevel: auditRiskLevel,
    workspaceId: lease.workspaceId,
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

  // 6. 强校验 ActionReceipt 并返回
  return ActionReceiptSchema.parse(receipt);
}

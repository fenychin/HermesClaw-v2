// TD-SPRINT-C-001: OpenClaw IM Gateway Connector
// Replaces httpbin.org stub with real channel-routed dispatch.
// Supports: email | whatsapp | wechat | dingtalk | sms | webhook
//
// Contract: AGENTS.md §3.4 — ConnectorLease + ActionReceipt required.

import crypto from "crypto"
import { ActionReceiptSchema, type ActionReceipt } from "@hermesclaw/event-contracts"
import { ConnectorLeaseSchema, type ConnectorLease } from "@hermesclaw/event-contracts"
import { writeAuditLog, createAuditEntry, updateAuditEntry } from "@/lib/server/audit"
import { actorFromSession } from "@/lib/server/audit"
import type { AuditRiskLevel } from "@/types"
import { storeReceipt } from "../receipt-store"

// ─── Channel type union ────────────────────────────────────────────────────
export type OpenClawChannel =
  | "email"
  | "whatsapp"
  | "wechat"
  | "dingtalk"
  | "sms"
  | "webhook"

// ─── Input contract ────────────────────────────────────────────────────────
export interface OpenClawGatewayInput {
  channel: OpenClawChannel
  to: string                           // recipient address / phone / openid
  subject?: string                     // for email only
  body: string                         // message content (plain text or HTML for email)
  templateId?: string                  // optional: OpenClaw template ID
  templateParams?: Record<string, string>
  metadata?: Record<string, unknown>   // pass-through to OpenClaw for tracing
}

// ─── Config resolution ─────────────────────────────────────────────────────
function getGatewayConfig() {
  const baseUrl = process.env.OPENCLAW_GATEWAY_BASE_URL
  const apiKey = process.env.OPENCLAW_GATEWAY_API_KEY
  const timeoutMs = parseInt(process.env.OPENCLAW_GATEWAY_TIMEOUT_MS || "10000", 10)

  if (!baseUrl || !apiKey) {
    throw new Error(
      "[openclaw-gateway] Missing env vars: OPENCLAW_GATEWAY_BASE_URL or OPENCLAW_GATEWAY_API_KEY. " +
      "Set them in .env.local (dev) or Vercel environment (prod)."
    )
  }
  return { baseUrl, apiKey, timeoutMs }
}

// ─── Channel → endpoint routing ────────────────────────────────────────────
function resolveEndpoint(baseUrl: string, channel: OpenClawChannel): string {
  const routes: Record<OpenClawChannel, string> = {
    email:     `${baseUrl}/channels/email/send`,
    whatsapp:  `${baseUrl}/channels/whatsapp/send`,
    wechat:    `${baseUrl}/channels/wechat/send`,
    dingtalk:  `${baseUrl}/channels/dingtalk/send`,
    sms:       `${baseUrl}/channels/sms/send`,
    webhook:   `${baseUrl}/channels/webhook/dispatch`,
  }
  return routes[channel]
}

// ─── Main export ───────────────────────────────────────────────────────────
export async function executeOpenClawGateway(
  lease: ConnectorLease,
  input: OpenClawGatewayInput,
  workflowRunId: string,
  idempotencyKey: string,
): Promise<ActionReceipt> {
  // 1. Validate lease contract
  ConnectorLeaseSchema.parse(lease)

  // 2. Resolve gateway config
  const { baseUrl, apiKey, timeoutMs } = getGatewayConfig()
  const endpoint = resolveEndpoint(baseUrl, input.channel)

  // 3. 预执行审计（AGENTS.md §3.5 连接器预执行审计约定）
  const actor = await actorFromSession()
  const auditRiskLevel: AuditRiskLevel =
    lease.maxRiskLevel === "critical" ? "high" : (lease.maxRiskLevel as AuditRiskLevel)

  const connectorAudit = await createAuditEntry({
    actor,
    action: "connector.execute",
    targetType: "connector",
    targetId: lease.connectorId,
    detail: `OpenClaw Gateway dispatching via channel=${input.channel} to=${input.to}`,
    riskLevel: auditRiskLevel,
    workspaceId: lease.workspaceId,
    workflowRunId,
    contextSnapshot: {
      channel: input.channel,
      endpoint,
      idempotencyKey,
    },
  })

  // 4. Build OpenClaw payload
  const payload = {
    channel: input.channel,
    to: input.to,
    subject: input.subject,
    body: input.body,
    templateId: input.templateId,
    templateParams: input.templateParams,
    idempotencyKey,           // OpenClaw uses this for dedup
    metadata: {
      workflowRunId,
      workspaceId: lease.workspaceId,
      taskId: lease.taskId,
      ...(input.metadata ?? {}),
    },
  }

  // 5. Execute with timeout
  let outcome: "success" | "failure" = "success"
  let responseData: Record<string, unknown> = {}
  let errorCode: string | undefined

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeoutHandle)

    if (!res.ok) {
      outcome = "failure"
      errorCode = `OPENCLAW_HTTP_${res.status}`
      responseData = {
        status: res.status,
        statusText: res.statusText,
        channel: input.channel,
      }
    } else {
      const text = await res.text()
      try { responseData = JSON.parse(text) }
      catch { responseData = { raw: text } }
    }
  } catch (err) {
    clearTimeout(timeoutHandle)
    outcome = "failure"
    errorCode = (err as Error).name === "AbortError"
      ? "OPENCLAW_TIMEOUT"
      : "OPENCLAW_NETWORK_ERROR"
    responseData = {
      error: err instanceof Error ? err.message : String(err),
      channel: input.channel,
    }
  }

  // 5.5 更新预执行审计状态（AGENTS.md §3.5 连接器预执行审计约定）
  await updateAuditEntry({
    auditId: connectorAudit.auditId,
    status: outcome === "success" ? "success" : "failed",
    detail: outcome === "success"
      ? `OpenClaw Gateway ${input.channel} dispatch to ${input.to} completed`
      : `OpenClaw Gateway ${input.channel} dispatch to ${input.to} failed: ${errorCode}`
  });

  // 6. Assemble and validate ActionReceipt
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
    compensationStrategy:
      "OpenClaw channel message dispatched. Compensation: use OpenClaw message recall API " +
      `with idempotencyKey=${idempotencyKey} if message must be retracted.`,
    version: "1.0.0",
  }

  // 6.5 存入数据库 (P0 四层日志链贯通)
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
    console.error("[openclaw-gateway-connector] ActionReceipt 存库失败：", storeErr)
  }

  return ActionReceiptSchema.parse(receipt)
}

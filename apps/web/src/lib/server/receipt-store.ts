/**
 * Receipt Store — ActionReceipt 持久化与证据链查询 (Phase 6)
 *
 * 三域归属：OpenClaw Execution Runtime（回执存储）
 *
 * 职责：
 * - 存储连接器执行回执（ActionReceiptSchema → DB）
 * - 按 taskId / workflowRunId / connectorId 查询回执链
 * - 验证回执完整性（高危写操作必须有 receipt）
 */
import { prisma } from "@/lib/prisma"
import { createHash } from "crypto"
import type { ActionReceipt as ActionReceiptContract } from "@hermesclaw/event-contracts"

// ─── 写入 ────────────────────────────────────────────────────────────────

export interface StoreReceiptInput {
  receiptId: string
  taskId: string
  workflowRunId: string
  connectorId: string
  idempotencyKey: string
  outcome: "success" | "failure"
  executedAt: string
  response?: Record<string, unknown>
  errorCode?: string
  failureReason?: string
  retryable?: boolean
  durationMs?: number
  compensationStrategy?: string
  version?: string
  workspaceId: string
}

/** 生成回执哈希（SHA-256），用于不可篡改验证 */
function generateReceiptHash(input: StoreReceiptInput): string {
  const payload = JSON.stringify({
    receiptId: input.receiptId,
    taskId: input.taskId,
    workflowRunId: input.workflowRunId,
    connectorId: input.connectorId,
    outcome: input.outcome,
    executedAt: input.executedAt,
    response: input.response,
    errorCode: input.errorCode,
  })
  return createHash("sha256").update(payload).digest("hex").slice(0, 16)
}

export async function storeReceipt(input: StoreReceiptInput): Promise<void> {
  const receiptHash = generateReceiptHash(input)

  await prisma.actionReceipt.create({
    data: {
      receiptId: input.receiptId,
      receiptHash,
      taskId: input.taskId,
      workflowRunId: input.workflowRunId,
      connectorId: input.connectorId,
      idempotencyKey: input.idempotencyKey,
      outcome: input.outcome,
      executedAt: new Date(input.executedAt),
      response: input.response as any,
      errorCode: input.errorCode ?? null,
      failureReason: input.failureReason ?? null,
      retryable: input.retryable ?? false,
      durationMs: input.durationMs ?? null,
      compensationStrategy: input.compensationStrategy ?? null,
      version: input.version ?? "1.0.0",
      workspaceId: input.workspaceId,
    },
  })
}

// ─── 查询 ────────────────────────────────────────────────────────────────

export async function getReceiptsByTask(
  workspaceId: string,
  taskId: string,
): Promise<ActionReceiptContract[]> {
  const rows = await prisma.actionReceipt.findMany({
    where: { workspaceId, taskId },
    orderBy: { executedAt: "asc" },
  })

  return rows.map(mapRow)
}

export async function getReceiptsByWorkflowRun(
  workspaceId: string,
  workflowRunId: string,
): Promise<ActionReceiptContract[]> {
  const rows = await prisma.actionReceipt.findMany({
    where: { workspaceId, workflowRunId },
    orderBy: { executedAt: "asc" },
  })

  return rows.map(mapRow)
}

/** 按连接器 ID 查询最近 N 条回执 */
export async function getReceiptsByConnector(
  workspaceId: string,
  connectorId: string,
  limit = 10,
): Promise<EnrichedReceipt[]> {
  const rows = await prisma.actionReceipt.findMany({
    where: { workspaceId, connectorId },
    orderBy: { executedAt: "desc" },
    take: limit,
  })

  return rows.map(mapEnrichedRow)
}

/** 富化的 ActionReceipt 返回类型（供前端展示） */
export interface EnrichedReceipt {
  receiptId: string
  receiptHash: string | null
  taskId: string
  workflowRunId: string
  connectorId: string
  idempotencyKey: string
  outcome: "success" | "failure"
  executedAt: string
  response?: Record<string, unknown>
  errorCode?: string
  failureReason?: string
  retryable: boolean
  durationMs?: number
  compensationStrategy?: string
  version: string
  createdAt: string
}

export async function getReceiptById(
  receiptId: string,
): Promise<ActionReceiptContract | null> {
  const row = await prisma.actionReceipt.findUnique({ where: { receiptId } })
  return row ? mapRow(row) : null
}

// ─── 完整性检查 ──────────────────────────────────────────────────────────

export async function findMissingReceipts(
  workspaceId: string,
  workflowRunId: string,
  expectedConnectorIds: string[],
): Promise<string[]> {
  const existing = await prisma.actionReceipt.findMany({
    where: { workspaceId, workflowRunId },
    select: { connectorId: true },
  })

  const received = new Set(existing.map((r) => r.connectorId))
  return expectedConnectorIds.filter((cid) => !received.has(cid))
}

// ─── 映射 ────────────────────────────────────────────────────────────────

function mapRow(row: any): ActionReceiptContract {
  return {
    receiptId: row.receiptId,
    taskId: row.taskId,
    workflowRunId: row.workflowRunId,
    connectorId: row.connectorId,
    idempotencyKey: row.idempotencyKey,
    outcome: row.outcome,
    executedAt: row.executedAt.toISOString(),
    response: row.response ?? {},
    errorCode: row.errorCode ?? undefined,
    compensationStrategy: row.compensationStrategy ?? undefined,
    version: row.version,
  }
}

function mapEnrichedRow(row: any): EnrichedReceipt {
  return {
    receiptId: row.receiptId,
    receiptHash: row.receiptHash ?? null,
    taskId: row.taskId,
    workflowRunId: row.workflowRunId,
    connectorId: row.connectorId,
    idempotencyKey: row.idempotencyKey,
    outcome: row.outcome,
    executedAt: row.executedAt.toISOString(),
    response: row.response ?? undefined,
    errorCode: row.errorCode ?? undefined,
    failureReason: row.failureReason ?? undefined,
    retryable: row.retryable ?? false,
    durationMs: row.durationMs ?? undefined,
    compensationStrategy: row.compensationStrategy ?? undefined,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  }
}

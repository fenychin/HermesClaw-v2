/**
 * Receipt Store — ActionReceipt 持久化与证据链查询 (Phase 6)
 *
 * 三域归属：OpenClaw Execution Runtime（回执存储）
 *
 * 职责：
 * - 存储连接器执行回执（ActionReceiptSchema → DB）
 * - 按 taskId / workflowRunId 查询回执链
 * - 验证回执完整性（高危写操作必须有 receipt）
 */
import { prisma } from "@/lib/prisma"
import type { ActionReceipt } from "@hermesclaw/event-contracts"

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
  compensationStrategy?: string
  version?: string
  workspaceId: string
}

export async function storeReceipt(input: StoreReceiptInput): Promise<void> {
  await prisma.actionReceipt.create({
    data: {
      receiptId: input.receiptId,
      taskId: input.taskId,
      workflowRunId: input.workflowRunId,
      connectorId: input.connectorId,
      idempotencyKey: input.idempotencyKey,
      outcome: input.outcome,
      executedAt: new Date(input.executedAt),
      response: input.response as any,
      errorCode: input.errorCode ?? null,
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
): Promise<ActionReceipt[]> {
  const rows = await prisma.actionReceipt.findMany({
    where: { workspaceId, taskId },
    orderBy: { executedAt: "asc" },
  })

  return rows.map(mapRow)
}

export async function getReceiptsByWorkflowRun(
  workspaceId: string,
  workflowRunId: string,
): Promise<ActionReceipt[]> {
  const rows = await prisma.actionReceipt.findMany({
    where: { workspaceId, workflowRunId },
    orderBy: { executedAt: "asc" },
  })

  return rows.map(mapRow)
}

export async function getReceiptById(
  receiptId: string,
): Promise<ActionReceipt | null> {
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

function mapRow(row: any): ActionReceipt {
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

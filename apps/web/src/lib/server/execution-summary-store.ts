/**
 * ExecutionSummary 持久化服务
 *
 * 三域归属：Hermes Control Kernel（治理层）
 *
 * P2 治理闭环：将 ExecutionSummary 从 WorkflowRun.outputContext 代偿升级为
 * 独立 DB 实体写入。写入点在 WorkflowRun 终态（completed/failed/cancelled）时调用。
 */
import { prisma } from "@/lib/prisma"
import { executionSummarySchema } from "@hermesclaw/event-contracts"

export interface StoreExecutionSummaryInput {
  summaryId: string
  taskId: string
  workflowRunId: string
  workspaceId: string
  finalStatus: "completed" | "failed" | "cancelled" | "partial"
  startedAt: Date
  completedAt: Date
  eventCount: number
  receiptHashes?: string[]
  error?: string
  version?: string
}

export async function storeExecutionSummary(input: StoreExecutionSummaryInput): Promise<void> {
  const summary = executionSummarySchema.parse({
    summaryId: input.summaryId,
    taskId: input.taskId,
    workflowRunId: input.workflowRunId,
    finalStatus: input.finalStatus,
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    eventCount: input.eventCount,
    receiptHashes: input.receiptHashes ?? [],
    error: input.error,
    version: input.version ?? "1.0.0",
  })

  try {
    await prisma.executionSummary.create({
      data: {
        summaryId: summary.summaryId,
        taskId: summary.taskId,
        workflowRunId: summary.workflowRunId,
        workspaceId: input.workspaceId,
        finalStatus: summary.finalStatus,
        startedAt: new Date(summary.startedAt),
        completedAt: new Date(summary.completedAt),
        eventCount: summary.eventCount,
        receiptHashes: JSON.stringify(summary.receiptHashes),
        error: summary.error ?? null,
        version: summary.version,
      },
    })
  } catch (error) {
    // 不阻断主流程，但治理数据丢失须醒目上报
    console.error(
      "[storeExecutionSummary] ExecutionSummary 写入失败，治理留痕已丢失：",
      { taskId: input.taskId, workflowRunId: input.workflowRunId, error },
    )
  }
}

export async function getExecutionSummaryByWorkflowRun(workflowRunId: string) {
  return prisma.executionSummary.findFirst({
    where: { workflowRunId },
    orderBy: { createdAt: "desc" },
  })
}

export async function getExecutionSummaryByTask(taskId: string) {
  return prisma.executionSummary.findFirst({
    where: { taskId },
    orderBy: { createdAt: "desc" },
  })
}

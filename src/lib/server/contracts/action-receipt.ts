import crypto from "crypto";

// 补偿策略（AGENTS.md §3.4：对外不可逆写操作必须声明 compensationStrategy）
export type CompensationStrategyType =
  | 'none'           // 无需补偿（幂等读操作）
  | 'manual'         // 需人工介入补偿
  | 'auto-reverse'   // 系统可自动逆操作
  | 'best-effort'    // 尽力补偿，不保证完全逆转
  | 'not-applicable'; // 不可逆，需提前审批

export interface CompensationStrategy {
  type: CompensationStrategyType;
  description?: string;
  reverseActionType?: string;   // 若 auto-reverse，指定逆操作的 actionType
  reverseInput?: Record<string, unknown>;
}

export type ActionReceiptStatus = 'success' | 'partial' | 'failed' | 'pending';

export interface ActionReceipt {
  receiptId: string;
  taskId: string;
  workflowRunId: string;
  connectorId: string;
  status: ActionReceiptStatus;
  executedAt: Date;
  durationMs: number;
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  receiptHash: string;          // 防篡改哈希（sha256(receiptId+taskId+status+executedAt)）
  compensationStrategy: CompensationStrategy;
  idempotencyKey: string;       // 来自 TaskEnvelope，用于去重保护
  isIrreversible: boolean;      // 是否不可逆写操作
  metadata?: Record<string, unknown>;
}

// 无回执的写操作默认视为高风险（AGENTS.md §3.4）
export function isHighRiskWithoutReceipt(receipt: ActionReceipt | null | undefined): boolean {
  return receipt === null || receipt === undefined;
}

// 辅助函数：计算 receiptHash
export function generateReceiptHash(receipt: {
  receiptId: string;
  taskId: string;
  status: ActionReceiptStatus;
  executedAt: Date;
}): string {
  const inputStr = `${receipt.receiptId}${receipt.taskId}${receipt.status}${receipt.executedAt.toISOString()}`;
  return crypto.createHash("sha256").update(inputStr).digest("hex");
}

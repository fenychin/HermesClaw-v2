import crypto from "crypto";

// 自动化授权等级（AGENTS.md §5.2）
export type AutomationLevel = 'L1' | 'L2' | 'L3' | 'L4';

// 风险等级（与 audit.ts 保持一致）
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

// 任务动作类型
export type ActionType =
  | 'workflow.run'
  | 'connector.execute'
  | 'memory.write'
  | 'skill.invoke'
  | 'agent.dispatch'
  | 'proposal.execute'
  | string;  // 允许扩展，但必须有命名空间前缀

// TaskEnvelope 必须包含 AGENTS.md §3.3 规定的全部 13 个字段
// + 以下扩展字段（工程必要）：createdAt、expiresAt、traceId、metadata
export interface TaskEnvelope {
  // AGENTS.md §3.3 最小必备字段（13个，一个不少）
  taskId: string;
  workflowRunId: string;
  workspaceId: string;
  industryId: string;
  agentId: string;
  actionType: ActionType;
  input: Record<string, unknown>;
  automationLevel: AutomationLevel;
  riskLevel: RiskLevel;
  idempotencyKey: string;
  callbackTarget: string;
  policySnapshotVersion: string;
  version: string;              // 契约版本，当前固定为 '1.0'

  // 工程扩展字段
  createdAt: Date;
  expiresAt?: Date;
  traceId?: string;
  parentTaskId?: string;        // 子任务链追踪
  metadata?: Record<string, unknown>;
}

// 创建 TaskEnvelope 的辅助函数（自动填充 taskId、idempotencyKey、createdAt、version）
export function createTaskEnvelope(
  params: Omit<TaskEnvelope, 'taskId' | 'idempotencyKey' | 'createdAt' | 'version'>
): TaskEnvelope {
  const uuid = crypto.randomUUID();
  return {
    ...params,
    taskId: uuid,
    idempotencyKey: `idem-${uuid}`,
    createdAt: new Date(),
    version: '1.0',
  };
}

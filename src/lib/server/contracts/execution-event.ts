// 标准事件族（AGENTS.md §3.3 要求 eventType 必须映射到标准事件族）
export type ExecutionEventType =
  // run.* 族
  | 'run.started'
  | 'run.node.started'
  | 'run.node.completed'
  | 'run.node.failed'
  | 'run.node.retrying'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  // session.* 族
  | 'session.created'
  | 'session.closed'
  | 'session.error'
  // tool.* 族
  | 'tool.invoked'
  | 'tool.completed'
  | 'tool.failed'
  // connector.* 族（扩展）
  | 'connector.executed'
  | 'connector.failed'
  | 'connector.retrying'
  // approval.* 族（扩展）
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.rejected'
  | 'approval.expired'
  // memory.* 族（扩展）
  | 'memory.read.miss'
  | 'memory.write.success';

export type ExecutionEventStatus = 
  | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'retrying';

// ExecutionEvent 必须包含 AGENTS.md §3.3 全部必备字段
export interface ExecutionEvent {
  // 必备字段（11个）
  eventId: string;
  taskId: string;
  workflowRunId: string;
  runtimeId: string;
  eventType: ExecutionEventType;
  status: ExecutionEventStatus;
  timestamp: Date;
  payload: Record<string, unknown>;
  connectorId?: string;          // 可选
  deviceId?: string;             // 可选
  receiptHash?: string;          // 可选

  // 工程扩展
  version: string;               // 事件版本
  traceId?: string;
  durationMs?: number;
  retryCount?: number;
  errorMessage?: string;
}

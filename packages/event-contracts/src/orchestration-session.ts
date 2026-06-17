export type OrchestrationMode = 'sequential' | 'parallel' | 'conditional' | 'human-in-loop'
export type SessionStatus =
  | 'initializing'
  | 'running'
  | 'waiting-human'     // 等待人工介入
  | 'merging'           // 结果合并中
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface OrchestrationSession {
  sessionId: string
  workspaceId: string
  workflowRunId: string           // 关联的 WorkflowRun
  orchestratorAgentId: string
  subAgentIds: string[]           // 参与协同的 Sub-Agent 列表
  mode: OrchestrationMode
  status: SessionStatus
  goal: string                    // 总目标描述
  inputContext: Record<string, unknown>
  mergedOutput?: Record<string, unknown>
  startedAt: Date
  completedAt?: Date
  failedAt?: Date
  failedReason?: string
  humanInterventionReason?: string
  createdBy: string
}

export interface SubAgentTask {
  taskId: string
  sessionId: string
  agentId: string
  instruction: string
  inputData: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  output?: Record<string, unknown>
  errorCode?: string
  errorMessage?: string
  startedAt?: Date
  completedAt?: Date
  retryCount: number
  maxRetries: number
  timeoutMs: number
  priority: 'low' | 'normal' | 'high' | 'urgent'
}

export const AGENT_MESSAGE_PROTOCOL_VERSION = '1.0'

export type AgentMessageRole = 'orchestrator' | 'sub-agent' | 'human' | 'system'
export type AgentMessageType =
  | 'task-dispatch'      // Orchestrator → Sub-Agent：分配子任务
  | 'task-result'        // Sub-Agent → Orchestrator：返回执行结果
  | 'task-error'         // Sub-Agent → Orchestrator：报告执行错误
  | 'clarification-request'  // Sub-Agent → Human：请求澄清
  | 'clarification-response' // Human → Sub-Agent：澄清回复
  | 'status-update'      // Sub-Agent → Orchestrator：进度汇报
  | 'broadcast'          // Orchestrator → All：广播指令

export interface AgentMessage {
  messageId: string
  sessionId: string          // OrchestrationSession.sessionId
  fromAgentId: string
  toAgentId: string          // 广播时为 '*'
  fromRole: AgentMessageRole
  messageType: AgentMessageType
  payload: Record<string, unknown>
  correlationId?: string     // 关联的上游 messageId（reply 场景）
  taskId?: string            // 关联 of SubAgentTask.taskId
  stepId?: string            // 关联 of StepRun.stepId
  timestamp: Date
  protocolVersion: string    // AGENT_MESSAGE_PROTOCOL_VERSION
}

export interface TaskDispatchPayload {
  instruction: string
  inputData: Record<string, unknown>
  expectedOutputSchema?: Record<string, unknown>
  timeoutMs?: number
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

export interface TaskResultPayload {
  output: Record<string, unknown>
  summary: string
  confidence?: number        // 0-1，Sub-Agent 对结果的置信度
  latencyMs: number
}

export interface TaskErrorPayload {
  errorCode: string
  message: string
  retryable: boolean
  context?: Record<string, unknown>
}

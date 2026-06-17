/**
 * ReasoningTrace — 推理轨迹契约
 * 落地 AGENTS.md §1.3 AI-First 透明化要求
 * 用于在对话界面向企业用户展示 AI 的推理过程与数据溯源
 */

export type TraceStepType =
  | 'intent.parse'        // 意图解析
  | 'memory.recall'       // 记忆召回
  | 'model.route'         // 模型路由决策
  | 'guardrail.check'     // 护栏检查
  | 'skill.select'        // Skill 选择
  | 'workflow.plan'       // 工作流规划
  | 'connector.call'      // 连接器调用
  | 'proposal.generate'   // 提案生成
  | 'fallback.triggered'  // 降级触发
  | 'llm.generate'        // 模型推理与生成

export type TraceStepStatus = 'running' | 'passed' | 'blocked' | 'fallback' | 'error'

export interface TraceStep {
  id: string                    // crypto.randomUUID()
  type: TraceStepType
  status: TraceStepStatus
  label: string                 // 面向用户的中文标签，如「理解您的指令」
  startedAt: string             // ISO 8601
  completedAt?: string
  durationMs?: number

  // 溯源数据（前端可展开）
  inputs?: Record<string, unknown>    // 脱敏后的输入
  outputs?: Record<string, unknown>   // 脱敏后的输出
  reasoning?: string                  // AI 推理摘要（可为模型返回的 thinking 字段）
  dataSources?: TraceDataSource[]     // 引用的数据来源
  blockedReason?: string              // 如果 status=blocked，必须填写原因
  fallbackReason?: string             // 如果 status=fallback，必须填写原因
  modelUsed?: string                  // 使用的模型名称，如 gpt-4o-mini
}

export interface TraceDataSource {
  type: 'memory' | 'skill' | 'connector' | 'policy' | 'knowledge'
  id: string                    // 对应记录的数据库 ID（可用于前端点击跳转）
  label: string                 // 面向用户的标签，如「2024年客户偏好记录」
  excerpt?: string              // 简短摘要（不超过 100 字符）
}

export interface ReasoningTrace {
  traceId: string               // crypto.randomUUID()
  conversationId: string        // 关联的对话 ID
  messageId?: string            // 关联的消息 ID（如果是单次对话回复）
  workspaceId: string
  agentId?: string
  steps: TraceStep[]
  totalDurationMs?: number
  createdAt: string
}

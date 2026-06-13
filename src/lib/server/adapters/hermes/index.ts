/**
 * Hermes Adapter 统一出口
 *
 * 使用方式：
 *   import { hermesClient } from '@/lib/server/adapters/hermes'
 *   import type { HermesRunWorkflowRequest } from '@/lib/server/adapters/hermes'
 */

export { hermesClient } from './client'
export { assembleHermesPrompt } from './prompt-assembler'

// 已有类型
export type {
  HermesRunWorkflowRequest,
  HermesRunWorkflowResponse,
  HermesWorkflowStatus,
  HermesMemoryWriteRequest,
  HermesMemoryReadRequest,
  HermesMemoryReadResponse,
  HermesMemoryLevel,
  HermesHarnessEvaluateRequest,
  HermesHarnessProposal,
  HermesRiskLevel,
} from './types'

// P2 新增：Agent 会话管理
export type {
  HermesSessionIdentifier,
  HermesCreateSessionRequest,
  HermesReportToolCallsRequest,
} from './types'

// P2 新增：工具调用追踪
export type {
  HermesToolCallTrace,
  HermesMessage,
} from './types'

// P2 新增：Prompt / Context 组装
export type {
  HermesPromptAssemblyRequest,
  HermesAssembledPrompt,
  HermesMemoryEntry,
  HermesToolManifest,
  ContextPolicySnapshot,
} from './types'

// P2 新增：评估报告提交 & 健康检查
export type {
  HermesSubmitReportRequest,
  HermesHealthCheckResponse,
} from './types'

/**
 * Hermes Adapter 统一出口
 *
 * 使用方式：
 *   import { hermesClient } from '@/lib/server/adapters/hermes'
 *   import type { HermesRunWorkflowRequest } from '@/lib/server/adapters/hermes'
 */

export { hermesClient } from './client'

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

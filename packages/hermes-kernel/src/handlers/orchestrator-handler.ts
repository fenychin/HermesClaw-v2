/**
 * Orchestrator Handler — 多智能体编排核心业务逻辑
 *
 * 从 apps/web/src/app/api/orchestrator/[id]/route.ts 下沉至此
 *
 * 三域归属：Hermes Control Kernel
 *
 * 设计要点：
 * - 复用 ./orchestration 模块提供的 createTaskEnvelope / orchestrate 原语
 * - 以依赖注入（OrchestratorHandlerDeps）将真正的 runOrchestrationFn / checkGateFn 注入
 * - 路由层只负责参数解析与响应序列化，业务规则（复杂度门禁、L3 自动化等级判定）位于 ./orchestration
 */

import type { TaskEnvelope } from '@hermesclaw/event-contracts'
import { createTaskEnvelope, orchestrate } from '../orchestration'

export interface OrchestratorHandlerDeps {
  /** 真正的多智能体编排执行函数（异步，返回 Promise） */
  runOrchestrationFn: (input: OrchestrationRunInput) => Promise<unknown>
  /** 自动化等级 / 风险闸门检查 */
  checkGateFn: (input: GateCheckInput) => Promise<{ ok: boolean; response?: unknown }>
}

export interface OrchestrationRunInput {
  sessionId: string
  workflowRunId: string
  workspaceId?: string
  orchestratorAgentId?: string
  subAgentIds: string[]
  mode?: 'sequential' | 'parallel' | 'hierarchical'
  goal?: string
  inputContext?: unknown
  subInstructions?: unknown
  createdBy?: string
}

export interface GateCheckInput {
  automationLevel: 'L0' | 'L1' | 'L2' | 'L3' | 'L4'
  riskLevel: 'low' | 'medium' | 'high'
  confirmed: boolean
  actionName: string
}

export interface OrchestratorDispatchInput {
  subAgentIds: string[]
  workspaceId?: string
  orchestratorAgentId?: string
  mode?: 'sequential' | 'parallel' | 'hierarchical'
  goal?: string
  inputContext?: unknown
  subInstructions?: unknown
  createdBy?: string
  sessionId?: string
  workflowRunId?: string
  /** 是否已通过用户确认（与高风险闸门一起使用） */
  confirm?: boolean
}

export interface OrchestratorDispatchResult {
  ok: boolean
  sessionId?: string
  response?: unknown
}

export interface OrchestratorEnvelopeInput {
  taskId?: string
  workflowRunId?: string
  workspaceId?: string
  [key: string]: unknown
}

/**
 * 创建任务信封（薄封装，便于测试）
 */
export function createOrchestratorEnvelope(
  params: OrchestratorEnvelopeInput,
): Partial<TaskEnvelope> {
  return createTaskEnvelope(params as Partial<TaskEnvelope>)
}

/**
 * 派发多智能体编排任务
 *
 * - subAgentIds.length > 4 时自动触发 L3 风险闸门
 * - 派发后立即返回（异步执行 run），不阻塞调用方
 */
export async function dispatchOrchestration(
  deps: OrchestratorHandlerDeps,
  input: OrchestratorDispatchInput,
): Promise<OrchestratorDispatchResult> {
  return orchestrate(deps.runOrchestrationFn, deps.checkGateFn, input)
}

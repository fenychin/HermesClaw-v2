/**
 * OpenClaw Mock 模式实现
 *
 * 开发阶段使用，模拟 OpenClaw API 的响应行为。
 * 当 ADAPTER_CONFIG.openclaw.useMock 为 true 时自动启用。
 *
 * ★ Mock 层只负责：广播 ExecutionEvent SSE 事件 + 返回结构化 OpenClawTaskResult
 * ★ 禁止在 Mock 中调用任何 prisma 写操作或业务服务
 * ★ 此模块无 React/Next/前端 UI 依赖
 */

import type { ExecutionEvent } from '@hermesclaw/event-contracts'
import type {
  OpenClawTaskResult,
  OpenClawConnectorStatus,
  OpenClawSyncResult,
  OpenClawExecuteTaskRequest,
} from './types'

/** 模拟任务执行延迟范围（毫秒） */
const MOCK_TASK_DELAY_MIN = 100
const MOCK_TASK_DELAY_MAX = 500

/** 模拟失败概率（5%），用于覆盖前端失败态 UI */
const MOCK_TASK_FAILURE_RATE = 0.05

/** 模拟失败原因池 */
const FAILURE_REASONS = [
  '连接器超时未响应',
  '上游 API 返回 503',
  '任务输入参数校验失败',
  '内存不足导致执行中断',
]

/** 随机延迟 */
function randomDelay(): number {
  return Math.floor(
    Math.random() * (MOCK_TASK_DELAY_MAX - MOCK_TASK_DELAY_MIN) + MOCK_TASK_DELAY_MIN,
  )
}

/**
 * 事件发射器回调类型 —— 由外部注入，解耦 Mock 与 event-emitter。
 * 当未注入时，Mock 静默跳过事件广播（不影响任务结果返回）。
 */
type EventEmitterFn = (event: ExecutionEvent) => void

/** 全局可注入的事件发射器（由 executor 在 createOpenClawAdapter 时注入） */
let mockEventEmitter: EventEmitterFn | null = null

/**
 * 设置 Mock 事件发射器
 */
export function setMockEventEmitter(emitter: EventEmitterFn | null): void {
  mockEventEmitter = emitter
}

/**
 * 广播执行事件（安全调用，不抛异常）
 */
function safeEmit(event: ExecutionEvent): void {
  if (!mockEventEmitter) return
  try {
    mockEventEmitter(event)
  } catch {
    // Mock 事件广播失败不应影响任务结果
  }
}

/**
 * 模拟任务执行器回调类型
 * 调用方可注入"实际执行逻辑"（如 HTTP connector），使 mock 不走随机假数据
 */
export type MockTaskExecutor = (
  req: OpenClawExecuteTaskRequest,
) => Promise<{ outcome: 'success' | 'failure'; response?: Record<string, unknown>; errorCode?: string }>

let mockTaskExecutor: MockTaskExecutor | null = null

/**
 * 注册 Mock 任务执行回调（由 executor 注入）
 */
export function setMockTaskExecutor(executor: MockTaskExecutor | null): void {
  mockTaskExecutor = executor
}

/**
 * 模拟任务执行：通过事件发射器广播实时状态变更，
 * 然后返回结构化的 OpenClawTaskResult。
 */
async function mockExecuteTask(body: unknown): Promise<OpenClawTaskResult> {
  const req = (body ?? {}) as Record<string, unknown>
  const taskId = (req.taskId as string) ?? `mock-task-${Date.now()}`
  const inputs = (req.inputs ?? {}) as Record<string, unknown>
  const taskName = (inputs.taskName as string) ?? '未命名任务'
  const agentId = (inputs.agentId as string) ?? 'mock-agent'
  const workflowRunId = (inputs.workflowRunId as string) ?? `mock-run-${Date.now()}`
  const parentRunId = inputs.parentRunId as string | undefined

  // 1. 广播 task:started 事件
  safeEmit({
    eventId: `evt-${crypto.randomUUID()}`,
    taskId,
    workflowRunId,
    parentWorkflowRunId: parentRunId,
    runtimeId: 'openclaw-mock-runtime',
    eventType: 'tool.call.started',
    status: 'started',
    timestamp: new Date().toISOString(),
    payload: {
      taskId,
      taskName,
      progress: 0,
      agentId,
    },
    version: '1.0.0',
  })

  // 2. 执行（注入的 executor 或随机模拟）
  let outcome: 'success' | 'failure'
  let responseData: Record<string, unknown> = {}
  let errorCode: string | undefined

  if (mockTaskExecutor) {
    // 使用注入的执行器
    const result = await mockTaskExecutor(req as unknown as OpenClawExecuteTaskRequest)
    outcome = result.outcome
    responseData = result.response ?? {}
    errorCode = result.errorCode
  } else {
    // 随机模拟
    const delay = randomDelay()
    await new Promise((resolve) => setTimeout(resolve, delay))

    outcome = Math.random() < MOCK_TASK_FAILURE_RATE ? 'failure' : 'success'
    if (outcome === 'success') {
      responseData = {
        summary: `Mock 任务「${taskName}」执行成功`,
        result: { mock: true, taskName },
        confidence: 0.92,
        _meta: { provider: 'mock', model: 'mock-model', duration: delay },
      }
    } else {
      errorCode = FAILURE_REASONS[Math.floor(Math.random() * FAILURE_REASONS.length)]
    }
  }

  // 3. 广播完成/失败事件
  if (outcome === 'success') {
    safeEmit({
      eventId: `evt-${crypto.randomUUID()}`,
      taskId,
      workflowRunId,
      parentWorkflowRunId: parentRunId,
      runtimeId: 'openclaw-mock-runtime',
      eventType: 'tool.call.completed',
      status: 'completed',
      timestamp: new Date().toISOString(),
      payload: {
        taskId,
        taskName,
        progress: 100,
        summary: (responseData.summary as string) ?? 'Mock 任务执行完成',
        durationMs: 100,
        agentId,
      },
      version: '1.0.0',
    })
  } else {
    safeEmit({
      eventId: `evt-${crypto.randomUUID()}`,
      taskId,
      workflowRunId,
      parentWorkflowRunId: parentRunId,
      runtimeId: 'openclaw-mock-runtime',
      eventType: 'tool.call.failed',
      status: 'failed',
      timestamp: new Date().toISOString(),
      payload: {
        taskId,
        taskName,
        error: errorCode,
        durationMs: 100,
        agentId,
      },
      version: '1.0.0',
    })
  }

  const result: OpenClawTaskResult = {
    taskId,
    status: outcome === 'success' ? 'succeeded' : 'failed',
    outputs: outcome === 'success' ? responseData : undefined,
    error: outcome === 'failure' ? errorCode : undefined,
    durationMs: 100,
    completedAt: new Date().toISOString(),
  }

  return result
}

/**
 * Mock 路由处理器映射
 */
const mockHandlers: Record<string, (body: unknown) => unknown | Promise<unknown>> = {
  '/tasks/execute': (body) => mockExecuteTask(body),

  '/connectors/status': (body): OpenClawConnectorStatus => {
    const req = (body ?? {}) as Record<string, unknown>
    return {
      connectorId: (req.connectorId as string) ?? 'mock-connector-001',
      name: '模拟数据连接器',
      health: 'healthy',
      lastHeartbeat: new Date().toISOString(),
      connectedSources: 3,
      version: '0.2.1',
      latencyMs: 45,
    }
  },

  '/data/sync': (): OpenClawSyncResult => {
    return {
      syncId: `mock-sync-${Date.now()}`,
      status: 'completed',
      totalRecords: 1500,
      syncedRecords: 1500,
      failedRecords: 0,
      startedAt: new Date(Date.now() - 5000).toISOString(),
      completedAt: new Date().toISOString(),
    }
  },
}

/**
 * OpenClaw Mock 客户端
 *
 * 通过路由匹配返回对应的 Mock 数据，
 * 未注册路由会抛出错误以便及时发现遗漏。
 */
export const openclawMock = {
  /**
   * 处理 Mock 请求
   * @param path - API 路径（如 '/tasks/execute'）
   * @param body - 请求体
   * @returns 模拟响应数据
   */
  async handle(path: string, body: unknown): Promise<unknown> {
    const handler = mockHandlers[path]
    if (!handler) {
      throw new Error(
        `[OpenClaw Mock] 未注册的 Mock 路由: ${path}，请在 mock.ts 中添加对应处理器`,
      )
    }
    return handler(body)
  },
}

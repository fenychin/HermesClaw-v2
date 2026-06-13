/**
 * OpenClaw Mock 模式实现
 *
 * 开发阶段使用，模拟 OpenClaw API 的响应行为。
 * 当 ADAPTER_CONFIG.openclaw.useMock 为 true 时自动启用。
 *
 * ★ Mock 层只负责：广播 ExecutionEvent SSE 事件 + 返回结构化 OpenClawTaskResult
 * ★ AgentLog 写入由 dag-runner 在 skill 节点执行完成后统一处理
 * ★ 禁止在 Mock 中调用任何 prisma 写操作或业务服务
 */
import type {
  OpenClawTaskResult,
  OpenClawConnectorStatus,
  OpenClawSyncResult,
} from './types'
import { emitExecutionEvent } from './event-emitter'
import { EXECUTION_EVENT_VERSION } from '@/contracts/execution-event'
import { logger } from '@/lib/logger'

/** 模拟任务执行延迟范围（毫秒） */
const MOCK_TASK_DELAY_MIN = 400
const MOCK_TASK_DELAY_MAX = 1800

/** 模拟任务失败概率（5%），用于覆盖前端失败态 UI */
const MOCK_TASK_FAILURE_RATE = 0.05

/** 随机延迟（模拟真实 API 响应时间） */
function randomDelay(): number {
  return Math.floor(
    Math.random() * (MOCK_TASK_DELAY_MAX - MOCK_TASK_DELAY_MIN) + MOCK_TASK_DELAY_MIN,
  )
}

/** 模拟失败原因池 */
const FAILURE_REASONS = [
  '连接器超时未响应',
  '上游 API 返回 503',
  '任务输入参数校验失败',
  '内存不足导致执行中断',
]

/**
 * 模拟任务执行：通过事件发射器广播实时状态变更。
 */
async function mockExecuteTask(body: unknown): Promise<OpenClawTaskResult> {
  const req = (body || {}) as Record<string, any>
  const taskId = req.taskId ?? `mock-task-${Date.now()}`
  const taskName = (req.inputs?.taskName as string) ?? '未命名任务'
  const agentId = (req.inputs?.agentId as string) ?? 'mock-agent'
  const workflowRunId = (req.inputs?.workflowRunId as string) ?? `mock-run-${Date.now()}`
  const parentWorkflowRunId = req.inputs?.parentRunId as string | undefined
  const shouldFail = req.inputs?.mockForceFail === true
    ? true
    : (req.inputs?.mockForceSuccess === true ? false : Math.random() < MOCK_TASK_FAILURE_RATE)
  // 1. 广播任务开始事件
  emitExecutionEvent({
    eventId: `evt-${crypto.randomUUID()}`,
    taskId,
    workflowRunId,
    parentWorkflowRunId,
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
    version: EXECUTION_EVENT_VERSION,
  })

  // 2. 模拟执行过程（分阶段进度）
  const delay = randomDelay()
  const steps = 3
  for (let i = 1; i <= steps; i++) {
    await new Promise((resolve) => setTimeout(resolve, Math.floor(delay / steps)))
    try {
      emitExecutionEvent({
        eventId: `evt-${crypto.randomUUID()}`,
        taskId,
        workflowRunId,
        parentWorkflowRunId,
        runtimeId: 'openclaw-mock-runtime',
        eventType: 'tool.call.started',
        status: 'progress',
        timestamp: new Date().toISOString(),
        payload: {
          taskId,
          taskName,
          progress: Math.round((i / steps) * 90), // 留 10% 给最终完成
          step: i,
          totalSteps: steps,
          agentId,
        },
        version: EXECUTION_EVENT_VERSION,
      })
    } catch {
      // 事件广播失败不阻断模拟执行主流程
      logger.warn(`[OpenClaw Mock] 进度事件广播失败 (taskId=${taskId}, step=${i})`)
    }
  }

  // 3. 模拟失败路径
  if (shouldFail) {
    const failureReason = FAILURE_REASONS[Math.floor(Math.random() * FAILURE_REASONS.length)]
    const result: OpenClawTaskResult = {
      taskId,
      status: 'failed',
      error: failureReason,
      durationMs: delay,
      completedAt: new Date().toISOString(),
    }

    try {
      emitExecutionEvent({
        eventId: `evt-${crypto.randomUUID()}`,
        taskId,
        workflowRunId,
        parentWorkflowRunId,
        runtimeId: 'openclaw-mock-runtime',
        eventType: 'tool.call.failed',
        status: 'failed',
        timestamp: new Date().toISOString(),
        payload: {
          taskId,
          taskName,
          error: failureReason,
          durationMs: delay,
          agentId,
        },
        version: EXECUTION_EVENT_VERSION,
      })
    } catch {
      logger.warn(`[OpenClaw Mock] 失败事件广播失败 (taskId=${taskId})`)
    }

    return result
  }

  // 4. 广播任务完成事件
  const result: OpenClawTaskResult = {
    taskId,
    status: 'succeeded',
    outputs: {
      summary: `模拟任务「${taskName}」执行完成`,
      processedItems: 42,
      quality: 'high',
      timestamp: new Date().toISOString(),
    },
    durationMs: delay,
    completedAt: new Date().toISOString(),
  }

  try {
    emitExecutionEvent({
      eventId: `evt-${crypto.randomUUID()}`,
      taskId,
      workflowRunId,
      parentWorkflowRunId,
      runtimeId: 'openclaw-mock-runtime',
      eventType: 'tool.call.completed',
      status: 'completed',
      timestamp: new Date().toISOString(),
      payload: {
        taskId,
        taskName,
        progress: 100,
        summary: result.outputs?.summary,
        durationMs: delay,
        agentId,
      },
      version: EXECUTION_EVENT_VERSION,
    })
  } catch {
    logger.warn(`[OpenClaw Mock] 完成事件广播失败 (taskId=${taskId})`)
  }

  return result
}

/**
 * Mock 路由处理器映射
 * —— 支持同步与异步处理器，统一通过 openclawMock.handle 调度。
 */
const mockHandlers: Record<string, (body: unknown) => unknown | Promise<unknown>> = {
  '/tasks/execute': (body) => {
    // 外层 try/catch：确保 emitExecutionEvent 的序列化异常不会导致 handle 抛出未捕获 rejection
      try {
        return mockExecuteTask(body)
      } catch (error) {
        logger.error('[OpenClaw Mock] mockExecuteTask 同步异常', {
          error: error instanceof Error ? error.message : String(error)
        })
        const req = (body || {}) as Record<string, any>
        const taskId = req.taskId ?? `mock-task-${Date.now()}`
      return {
        taskId,
        status: 'failed',
        error: 'Mock 执行异常',
        durationMs: 0,
        completedAt: new Date().toISOString(),
      } satisfies OpenClawTaskResult
    }
  },

  '/connectors/status': (body): OpenClawConnectorStatus => {
    const req = (body || {}) as Record<string, any>
    return {
      connectorId: req.connectorId ?? 'mock-connector-001',
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
 *
 * ★ handle 现支持 async handler，任务执行路径将广播 SSE 事件。
 */
export const openclawMock = {
  /**
   * 处理 Mock 请求
   * @param path - API 路径（如 '/tasks/execute'）
   * @param body - 请求体
   * @returns 模拟响应数据（支持 Promise）
   */
  async handle(path: string, body: unknown): Promise<unknown> {
    const handler = mockHandlers[path]
    if (!handler) {
      throw new Error(
        `[OpenClaw Mock] 未注册的 Mock 路由: ${path}，请在 mock.ts 中添加对应处理器`,
      )
    }
    logger.info(`[OpenClaw Mock] ${path} → ${JSON.stringify(body).slice(0, 200)}`)
    return handler(body)
  },
}


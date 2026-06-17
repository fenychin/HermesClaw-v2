/**
 * OpenClaw Execution Adapter — 执行器
 *
 * 三域原则第二域：唯一拥有 ExecutionEvent 回传权
 *
 * 此模块的职责：
 * 1. 接收来自 Hermes Kernel 的 TaskEnvelope
 * 2. 通过 OpenClaw API / Mock 调度执行
 * 3. 将结果包装为 ExecutionEvent 回传给 Kernel
 * 4. 禁止直接修改 TaskEnvelope 的 intent 字段（属于 Hermes 权限）
 *
 * 注意：此模块是纯执行传输层，不含：
 * - system-prompts 拼装（→ Hermes Kernel）
 * - 记忆读写（→ Hermes Kernel）
 * - workflow planning（→ Hermes Kernel）
 * - L1-L4 policy 判断（→ Hermes Kernel）
 */

import type { TaskEnvelope, ExecutionEvent } from '@hermesclaw/event-contracts'
import { ActionReceiptSchema, ACTION_RECEIPT_VERSION } from '@hermesclaw/event-contracts'
import type { ActionReceipt } from '@hermesclaw/event-contracts'
import type { OpenClawAdapterConfig, OpenClawExecuteTaskRequest, OpenClawTaskResult } from '../types'
import { OpenClawHttpClient } from '../gateway/client'
import { openclawMock, setMockEventEmitter, setMockTaskExecutor, type MockTaskExecutor } from '../mock'
import { emitEvent, subscribeEvents, unsubscribeEvents, sendHeartbeat, registerEventPublisher } from '../event-emitter'
import type { EventPublisher } from '../event-emitter'

/**
 * OpenClaw Execution Adapter 接口
 *
 * 遵守 CLAUDE.md §5.2 运行时事件设计要求。
 */
export interface ExecutionAdapter {
  /**
   * 分发 TaskEnvelope 至 OpenClaw 运行时执行。
   * 返回 { eventId } 作为此次调度的追踪标识。
   */
  dispatch(envelope: TaskEnvelope): Promise<{ eventId: string }>

  /**
   * 订阅执行事件。
   * @param taskId - 任务 ID
   * @param handler - 事件处理器
   * @returns 取消订阅函数
   */
  subscribe(taskId: string, handler: (event: ExecutionEvent) => void): () => void

  /**
   * 获取任务执行状态。
   * 返回最新一条匹配的 ExecutionEvent，若无事件则返回 null。
   */
  getStatus(taskId: string): Promise<ExecutionEvent['status'] | null>
}

/**
 * 运行时执行器回调类型
 *
 * 当 OpenClaw 外部 API 不可达时（非 Mock 模式），
 * 调用方可通过此回调注入本地执行逻辑（如 LLM 技能执行）。
 *
 * 注意：此回调仅负责"执行"，不做 system prompt 拼装等控制面工作 ——
 * 那些由 Hermes Kernel 在编排层完成，执行结果通过 TaskEnvelope.input 传入。
 */
export type LocalExecutor = (envelope: TaskEnvelope) => Promise<OpenClawTaskResult>

/**
 * 用于收集特定 taskId 全部事件的内部存储
 */
const taskEvents = new Map<string, ExecutionEvent[]>()

/**
 * 创建 OpenClaw Execution Adapter
 *
 * @param config - 适配器配置
 * @param localExecutor - 可选的本地执行回调（外部 API 不可达时的降级方案）
 * @returns ExecutionAdapter 实例
 */
export function createOpenClawAdapter(
  config: OpenClawAdapterConfig,
  localExecutor?: LocalExecutor,
): ExecutionAdapter {
  // 创建 HTTP 客户端（注入 mock handler）
  const httpClient = new OpenClawHttpClient(config, (path, body) => openclawMock.handle(path, body))

  // 将 event-emitter 注入 mock（使 mock 执行时可广播事件）
  setMockEventEmitter((event) => {
    // 收集事件
    const existing = taskEvents.get(event.taskId) ?? []
    existing.push(event)
    taskEvents.set(event.taskId, existing)
    // 广播
    emitEvent(event)
  })

  // 注入 mock 任务执行器（使用 HTTP executor 或 local executor）
  const mockExecutor: MockTaskExecutor = async (req) => {
    // Mock 模式下也尝试通过 HTTP client 调用（如果配置了真实 baseUrl 且非强制 mock）
    // 否则使用 local executor
    if (localExecutor) {
      // 构造最小 TaskEnvelope
      const envelope: TaskEnvelope = {
        taskId: req.taskId,
        workflowRunId: (req.inputs.workflowRunId as string) ?? `run-${Date.now()}`,
        workspaceId: (req.inputs.workspaceId as string) ?? 'default',
        industryId: (req.inputs.industryId as string) ?? 'default',
        agentId: (req.inputs.agentId as string) ?? 'default-agent',
        actionType: (req.inputs.actionType as string) ?? 'skill.unknown',
        input: req.inputs,
        automationLevel: 'L2',
        riskLevel: 'low',
        idempotencyKey: `idem-${req.taskId}`,
        callbackTarget: 'mock-callback',
        policySnapshotVersion: '1.0.0',
        version: '1.0.0',
      }
      try {
        const result = await localExecutor(envelope)
        return {
          outcome: result.status === 'succeeded' ? 'success' : 'failure',
          response: result.outputs,
          errorCode: result.error,
        }
      } catch (err) {
        return {
          outcome: 'failure',
          errorCode: err instanceof Error ? err.message : String(err),
        }
      }
    }
    // 无 localExecutor 时随机模拟
    const success = Math.random() > 0.05
    return {
      outcome: success ? 'success' : 'failure',
      response: success ? { summary: 'Mock 执行成功', result: { mock: true } } : undefined,
      errorCode: success ? undefined : 'Mock 随机失败',
    }
  }
  setMockTaskExecutor(mockExecutor)

  return {
    async dispatch(envelope: TaskEnvelope): Promise<{ eventId: string }> {
      const startTime = Date.now()

      // 构造 OpenClaw 请求
      const req: OpenClawExecuteTaskRequest = {
        taskId: envelope.taskId,
        inputs: {
          ...envelope.input,
          workflowRunId: envelope.workflowRunId,
          workspaceId: envelope.workspaceId,
          agentId: envelope.agentId,
          actionType: envelope.actionType,
        },
      }

      // 发射 started 事件
      const startedEvent: ExecutionEvent = {
        eventId: `evt-${crypto.randomUUID()}`,
        taskId: envelope.taskId,
        workflowRunId: envelope.workflowRunId,
        runtimeId: 'openclaw-runtime',
        eventType: 'run.started',
        status: 'started',
        timestamp: new Date().toISOString(),
        payload: {
          message: `Task ${envelope.taskId} execution started`,
          actionType: envelope.actionType,
        },
        version: '1.0.0',
      }
      emitEvent(startedEvent)

      // 收集事件
      const existing = taskEvents.get(envelope.taskId) ?? []
      existing.push(startedEvent)
      taskEvents.set(envelope.taskId, existing)

      let rawResult: OpenClawTaskResult
      try {
        rawResult = await httpClient.executeTask(req)
      } catch (error) {
        // 外部服务不可达，降级至 localExecutor
        if (localExecutor) {
          const errMsg = error instanceof Error ? error.message : String(error)
          console.warn(`[OpenClawAdapter] 外部服务不可达，降级至本地执行器: ${errMsg}`)
          rawResult = await localExecutor(envelope)
        } else {
          // 无 localExecutor，发射 failed 事件并抛错
          const failedEvent: ExecutionEvent = {
            eventId: `evt-${crypto.randomUUID()}`,
            taskId: envelope.taskId,
            workflowRunId: envelope.workflowRunId,
            runtimeId: 'openclaw-runtime',
            eventType: 'run.failed',
            status: 'failed',
            timestamp: new Date().toISOString(),
            payload: {
              error: error instanceof Error ? error.message : String(error),
              message: `Task ${envelope.taskId} dispatch failed`,
            },
            version: '1.0.0',
          }
          emitEvent(failedEvent)
          existing.push(failedEvent)
          taskEvents.set(envelope.taskId, existing)
          throw error
        }
      }

      const outcome = rawResult.status === 'succeeded' ? 'success' : 'failure'
      const durationMs = Date.now() - startTime

      // 构造 ActionReceipt
      const receipt: ActionReceipt = {
        receiptId: `rcpt-${crypto.randomUUID()}`,
        taskId: envelope.taskId,
        workflowRunId: envelope.workflowRunId,
        connectorId: envelope.actionType.split('.')[0] ?? 'openclaw',
        idempotencyKey: envelope.idempotencyKey,
        outcome: outcome === 'success' ? 'success' : 'failure',
        executedAt: new Date().toISOString(),
        response: rawResult.outputs ?? {},
        errorCode: rawResult.error,
        version: ACTION_RECEIPT_VERSION,
      }

      // 校验 receipt
      ActionReceiptSchema.parse(receipt)

      // 发射 completed/failed 事件
      const finalEvent: ExecutionEvent = {
        eventId: `evt-${crypto.randomUUID()}`,
        taskId: envelope.taskId,
        workflowRunId: envelope.workflowRunId,
        runtimeId: 'openclaw-runtime',
        eventType: outcome === 'success' ? 'run.completed' : 'run.failed',
        status: outcome === 'success' ? 'completed' : 'failed',
        timestamp: new Date().toISOString(),
        payload: {
          message: outcome === 'success'
            ? `Task ${envelope.taskId} completed successfully`
            : `Task ${envelope.taskId} failed`,
          outcome: receipt.outcome,
          receiptId: receipt.receiptId,
          idempotencyKey: receipt.idempotencyKey,
          durationMs,
          ...(rawResult.error ? { error: rawResult.error } : {}),
        },
        version: '1.0.0',
      }
      emitEvent(finalEvent)
      existing.push(finalEvent)
      taskEvents.set(envelope.taskId, existing)

      return { eventId: startedEvent.eventId }
    },

    subscribe(taskId: string, handler: (event: ExecutionEvent) => void): () => void {
      // 获取/创建事件缓存
      if (!taskEvents.has(taskId)) {
        taskEvents.set(taskId, [])
      }

      // 使用 event-emitter 订阅：按 taskId 在 handler 内过滤
      const connectionId = `sub-${crypto.randomUUID()}`

      const controller = {
        enqueue(_chunk: Uint8Array): void {
          try {
            const text = new TextDecoder().decode(_chunk)
            const sseData = text.replace(/^data:\s*/, '').trim()
            if (sseData) {
              const event = JSON.parse(sseData) as ExecutionEvent
              if (event.taskId === taskId) {
                handler(event)
              }
            }
          } catch {
            // 非 JSON 帧（如 heartbeat）静默跳过
          }
        },
        close() {},
        error(_err?: unknown) {},
      } as ReadableStreamDefaultController<Uint8Array>

      // 不传 filter 以接收所有事件，taskId 匹配在上方 handler 内完成
      subscribeEvents(connectionId, controller, {})

      return () => {
        unsubscribeEvents(connectionId)
      }
    },

    async getStatus(taskId: string): Promise<ExecutionEvent['status'] | null> {
      // 从内存缓存中获取最新事件状态
      const events = taskEvents.get(taskId)
      if (!events || events.length === 0) return null
      const latest = events[events.length - 1]
      return latest?.status ?? null
    },
  }
}


// Skill Executor — 技能测试执行
export { executeSkillTest } from "./skill-executor"
export type {
  SkillRecord,
  SkillTestInput,
  SkillExecutorDeps,
  SkillTestResult,
} from "./skill-executor"


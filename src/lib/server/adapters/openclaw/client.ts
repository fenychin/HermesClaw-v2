/**
 * OpenClaw HTTP 客户端（版本锁定）
 *
 * 负责与 OpenClaw API 的通信，自动处理：
 * - 版本路由：请求路径中嵌入锁定版本号
 * - Mock 降级：开发环境自动切换至 Mock 模式
 * - 超时控制：使用 AbortSignal.timeout 防止请求挂起
 * - 版本头注入：X-OpenClaw-Version 用于服务端版本校验
 */

import { ADAPTER_CONFIG } from '../../config/adapter-config'
import type {
  OpenClawExecuteTaskRequest,
  OpenClawTaskResult,
  OpenClawConnectorStatus,
  OpenClawSyncDataRequest,
  OpenClawSyncResult,
} from './types'
import { openclawMock } from './mock'
import type { TaskEnvelope } from '@/contracts/task-envelope'
import type { ActionReceipt } from '@/contracts/action-receipt'
import { ACTION_RECEIPT_VERSION } from '@/contracts/action-receipt'

/**
 * OpenClaw 统一 HTTP 客户端
 *
 * 遵循 AGENTS.md §4.3 受控工具接入规范：
 * - 所有请求均带版本头
 * - 错误响应抛出明确异常
 * - Mock 模式完全透明
 */
class OpenClawClient {
  private readonly config = ADAPTER_CONFIG.openclaw

  /**
   * 发送请求至 OpenClaw API
   * @param path - API 端点路径（不含版本前缀）
   * @param body - 请求体
   * @returns 响应数据
   */
  private async request<T>(path: string, body: unknown): Promise<T> {
    // Mock 模式：直接返回模拟数据，不发起网络请求
    if (this.config.useMock) {
      return openclawMock.handle(path, body) as T
    }

    const url = `${this.config.baseUrl}/v${this.config.version}${path}`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenClaw-Version': this.config.version,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout),
    })

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '无法读取错误响应体')
      throw new Error(
        `[OpenClaw API 错误] ${res.status} ${res.statusText} — ${url}\n${errorBody}`
      )
    }

    return res.json() as T
  }

  /**
   * 执行任务
   * @param envelope - 任务封装契约对象
   */
  async executeTask(
    envelope: TaskEnvelope
  ): Promise<ActionReceipt> {
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

    const rawResult = await this.request<OpenClawTaskResult>('/tasks/execute', req)
    const outcome: 'success' | 'failure' = rawResult.status === 'succeeded' ? 'success' : 'failure'

    return {
      receiptId: `rcpt-${crypto.randomUUID()}`,
      taskId: envelope.taskId,
      workflowRunId: envelope.workflowRunId,
      connectorId: envelope.actionType.split('.')[0] || 'openclaw',
      idempotencyKey: envelope.idempotencyKey,
      outcome,
      executedAt: new Date().toISOString(),
      response: rawResult.outputs || {},
      errorCode: rawResult.error,
      version: ACTION_RECEIPT_VERSION,
    }
  }

  /**
   * 查询连接器状态
   * @param connectorId - 连接器 ID
   */
  async getConnectorStatus(
    connectorId: string
  ): Promise<OpenClawConnectorStatus> {
    return this.request('/connectors/status', { connectorId })
  }

  /**
   * 触发数据同步
   * @param source - 数据源标识
   * @param target - 目标标识
   * @param options - 可选同步配置
   */
  async syncData(
    source: string,
    target: string,
    options?: { mode?: 'full' | 'incremental'; filters?: Record<string, unknown> }
  ): Promise<OpenClawSyncResult> {
    const req: OpenClawSyncDataRequest = {
      source,
      target,
      mode: options?.mode,
      filters: options?.filters,
    }
    return this.request('/data/sync', req)
  }
}

/** OpenClaw 客户端单例 */
export const openclawClient = new OpenClawClient()


/**
 * OpenClaw Gateway — HTTP 客户端层
 *
 * 职责：封装与 OpenClaw REST API 的所有 HTTP 通信。
 * - 版本路由：请求路径中嵌入锁定版本号
 * - Mock 降级：useMock 时自动切换至 Mock 模式
 * - 超时控制：使用 AbortSignal.timeout 防止请求挂起
 * - 版本头注入：X-OpenClaw-Version 用于服务端版本校验
 *
 * 此模块是纯执行传输层，无 memory/planning/policy 等控制逻辑。
 */

import type {
  OpenClawAdapterConfig,
  OpenClawExecuteTaskRequest,
  OpenClawTaskResult,
  OpenClawConnectorStatus,
  OpenClawSyncDataRequest,
  OpenClawSyncResult,
} from '../types'

/** 默认配置 */
const DEFAULT_VERSION = '0.2.1'
const DEFAULT_TIMEOUT = 15_000

/**
 * OpenClaw HTTP 客户端
 *
 * 遵循 AGENTS.md §4.3 受控工具接入规范：
 * - 所有请求均带版本头
 * - 错误响应抛出明确异常
 * - Mock 模式完全透明
 */
export class OpenClawHttpClient {
  private readonly config: OpenClawAdapterConfig
  private readonly mockHandler: ((path: string, body: unknown) => Promise<unknown>) | null

  constructor(config: OpenClawAdapterConfig, mockHandler?: (path: string, body: unknown) => Promise<unknown>) {
    this.config = {
      version: DEFAULT_VERSION,
      timeout: DEFAULT_TIMEOUT,
      useMock: false,
      ...config,
    }
    this.mockHandler = mockHandler ?? null
  }

  /**
   * 发送请求至 OpenClaw API
   * @param path - API 端点路径（不含版本前缀）
   * @param body - 请求体
   * @returns 响应数据
   */
  private async request<T>(path: string, body: unknown): Promise<T> {
    // Mock 模式：委托给 mock handler
    if (this.config.useMock && this.mockHandler) {
      return this.mockHandler(path, body) as Promise<T>
    }

    const version = this.config.version ?? DEFAULT_VERSION
    const url = `${this.config.baseUrl}/v${version}${path}`
    const fetchImpl = this.config.fetch ?? globalThis.fetch

    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenClaw-Version': version,
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout ?? DEFAULT_TIMEOUT),
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
   * @param req - 任务执行请求
   */
  async executeTask(req: OpenClawExecuteTaskRequest): Promise<OpenClawTaskResult> {
    return this.request<OpenClawTaskResult>('/tasks/execute', req)
  }

  /**
   * 查询连接器状态
   * @param connectorId - 连接器 ID
   */
  async getConnectorStatus(connectorId: string): Promise<OpenClawConnectorStatus> {
    return this.request<OpenClawConnectorStatus>('/connectors/status', { connectorId })
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
    return this.request<OpenClawSyncResult>('/data/sync', req)
  }
}
